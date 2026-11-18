package rs.elgor.nalog;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.domain.NalogStatus;
import rs.elgor.nalog.domain.PaymentType;
import rs.elgor.nalog.dto.CreateNalogRequest;
import rs.elgor.nalog.dto.CreateNalogRequest.*;
import rs.elgor.nalog.dto.NalogResponse;
import rs.elgor.nalog.service.NalogException;
import rs.elgor.nalog.service.NalogService;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class NalogServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired NalogService service;

    AuthUser admin = new AuthUser(1, "Admin", "admin");
    AuthUser tech2 = new AuthUser(2, "Tehničar Dva", "technician");
    AuthUser tech3 = new AuthUser(3, "Tehničar Tri", "technician");
    AuthUser manager = new AuthUser(4, "Menadžer", "manager");

    @BeforeEach
    void users() {
        insertUser(1, "Admin", "admin");
        insertUser(2, "Tehničar Dva", "technician");
        insertUser(3, "Tehničar Tri", "technician");
        insertUser(4, "Menadžer", "manager");
    }

    private CreateNalogRequest req(String type, NalogStatus status, Long assignTo) {
        return new CreateNalogRequest(null,
                new CustomerInput("Petar Petrović", "Cara Lazara 1", "Kruševac", "060 123 456", null, null),
                new ApplianceInput(type, "Gorenje", "X1", "SN1"),
                "Ne hladi", new BigDecimal("1.50"), new BigDecimal("8000.00"), PaymentType.values()[0], status, null, assignTo);
    }

    private CreateNalogRequest req(NalogStatus status, Long assignTo) { return req("AIR_CONDITIONER", status, assignTo); }

    private CreateNalogRequest req() { return req(null, null); }

    // ---------------------------------------------------------------- create

    @Test
    void createStoresTheTypedPriceAndWritesAudit() {
        NalogResponse n = service.create(req(), null, admin);

        assertEquals(NalogStatus.DRAFT, n.status());
        assertEquals(new BigDecimal("8000.00"), n.total());        // the typed price, nothing added on top
        assertEquals(new BigDecimal("0.00"), n.partsTotal());
        assertEquals(new BigDecimal("0.00"), n.vatAmount());
        assertTrue(n.partLines().isEmpty());                       // nalozi no longer carry parts
        assertNull(n.cancelReason());
        assertEquals(1, count("nalog_status_history"));
    }

    @Test
    void unknownDeviceTypeIsRejectedAndNothingIsSaved() {
        NalogException e = assertThrows(NalogException.class,
                () -> service.create(req("PERILICA_SUDA", null, null), null, admin));
        assertEquals(400, e.getStatus().value());
        assertEquals(0, count("nalog"));
        assertEquals(0, count("customer"));
    }

    @Test
    void aCustomDeviceTypeCanBeUsedOnceAdded() {
        jdbc.update("INSERT INTO appliance_type_custom (name) VALUES ('Perilica sudova')");
        NalogResponse n = service.create(req("Perilica sudova", null, null), null, admin);
        assertEquals("Perilica sudova", n.appliance().type());
    }

    @Test
    void sameIdempotencyKeyCreatesOnlyOneNalog() {
        NalogResponse a = service.create(req(), "key-1", admin);
        NalogResponse b = service.create(req(), "key-1", admin);

        assertEquals(a.id(), b.id());
        assertEquals(1, count("nalog"));
        assertEquals(1, count("nalog_status_history"));          // recorded once, not twice
    }

    @Test
    void newNalogCannotStartInProgress() {
        NalogException e = assertThrows(NalogException.class,
                () -> service.create(req(NalogStatus.IN_PROGRESS, null), null, admin));
        assertEquals(400, e.getStatus().value());
    }

    @Test
    void technicianCannotCreateANalogAtAll() {
        assertEquals(403, assertThrows(NalogException.class,
                () -> service.create(req(null, 3L), null, tech2)).getStatus().value());
        assertEquals(403, assertThrows(NalogException.class,
                () -> service.create(req(), null, tech2)).getStatus().value());
        assertEquals(0, count("nalog"));
    }

    // ---------------------------------------------------------------- status machine

    @Test
    void walksTheHappyPathAndStampsCompletion() {
        NalogResponse n = service.create(req(), null, admin);
        service.changeStatus(n.id(), NalogStatus.DISPATCHED, null, admin);
        service.changeStatus(n.id(), NalogStatus.IN_PROGRESS, null, admin);
        service.changeStatus(n.id(), NalogStatus.AWAITING_PARTS, null, admin);
        service.changeStatus(n.id(), NalogStatus.IN_PROGRESS, null, admin);
        readyToClose(n.id());
        NalogResponse done = service.changeStatus(n.id(), NalogStatus.COMPLETED, null, admin);

        assertEquals(NalogStatus.COMPLETED, done.status());
        assertNotNull(done.completedAt());
        assertEquals(6, service.history(n.id(), admin).size());
    }

    @Test
    void technicianMovesFreelyBetweenWorkingStatusesAndCanCloseFromAny() {
        NalogResponse n = service.create(req(NalogStatus.DISPATCHED, 2L), null, admin);
        for (NalogStatus s : List.of(NalogStatus.RECEIVED, NalogStatus.TESTING, NalogStatus.DRIVING,
                NalogStatus.NEEDS_ELECTRICIAN, NalogStatus.AWAITING_PARTS, NalogStatus.IN_PROGRESS, NalogStatus.TESTING)) {
            assertEquals(s, service.changeStatus(n.id(), s, null, tech2).status());
        }
        assertEquals(409, assertThrows(NalogException.class,
                () -> service.changeStatus(n.id(), NalogStatus.DISPATCHED, null, tech2)).getStatus().value());   // no way back
        readyToClose(n.id());
        assertEquals(NalogStatus.COMPLETED, service.changeStatus(n.id(), NalogStatus.COMPLETED, null, tech2).status());
    }

    @Test
    void aManagerHasAdminPowers() {
        NalogResponse n = service.create(req(), null, manager);
        assertEquals(NalogStatus.CANCELLED, service.changeStatus(n.id(), NalogStatus.CANCELLED, "Klijent odustao", manager).status());
    }

    @Test
    void closingNeedsABeforeAndAnAfterPhotoAndAKonstatacija() {
        NalogResponse n = service.create(req(), null, admin);
        service.changeStatus(n.id(), NalogStatus.DISPATCHED, null, admin);
        service.changeStatus(n.id(), NalogStatus.IN_PROGRESS, null, admin);

        assertEquals(400, assertThrows(NalogException.class,
                () -> service.changeStatus(n.id(), NalogStatus.COMPLETED, null, admin)).getStatus().value());

        addNote(n.id(), "Zamenjen deo");                                                       // konstatacija, still no photo
        assertEquals(400, assertThrows(NalogException.class,
                () -> service.changeStatus(n.id(), NalogStatus.COMPLETED, null, admin)).getStatus().value());

        addPhoto(n.id(), "before");                                                            // only Pre, no Posle
        assertEquals(400, assertThrows(NalogException.class,
                () -> service.changeStatus(n.id(), NalogStatus.COMPLETED, null, admin)).getStatus().value());

        addPhoto(n.id(), "label");                                                             // another category does not count
        assertEquals(400, assertThrows(NalogException.class,
                () -> service.changeStatus(n.id(), NalogStatus.COMPLETED, null, admin)).getStatus().value());

        addPhoto(n.id(), "after");
        assertEquals(NalogStatus.COMPLETED, service.changeStatus(n.id(), NalogStatus.COMPLETED, null, admin).status());
    }

    @Test
    void illegalTransitionsAreRejected() {
        NalogResponse n = service.create(req(), null, admin);
        NalogException e = assertThrows(NalogException.class,
                () -> service.changeStatus(n.id(), NalogStatus.COMPLETED, null, admin));
        assertEquals(409, e.getStatus().value());

        service.changeStatus(n.id(), NalogStatus.CANCELLED, "Klijent odustao", admin);
        assertThrows(NalogException.class, () -> service.changeStatus(n.id(), NalogStatus.DISPATCHED, null, admin));
    }

    @Test
    void cancellingNeedsAReasonAndStoresIt() {
        NalogResponse n = service.create(req(NalogStatus.DISPATCHED, 2L), null, admin);

        assertEquals(400, assertThrows(NalogException.class,
                () -> service.changeStatus(n.id(), NalogStatus.CANCELLED, null, tech2)).getStatus().value());
        assertEquals(400, assertThrows(NalogException.class,
                () -> service.changeStatus(n.id(), NalogStatus.CANCELLED, "   ", admin)).getStatus().value());
        assertEquals(NalogStatus.DISPATCHED, service.get(n.id(), admin).status());          // nothing changed

        NalogResponse c = service.changeStatus(n.id(), NalogStatus.CANCELLED, "  Klijent nije kod kuće ", tech2);
        assertEquals(NalogStatus.CANCELLED, c.status());
        assertEquals("Klijent nije kod kuće", c.cancelReason());
        assertEquals(2, service.history(n.id(), admin).size());
    }

    @Test
    void aTechnicianCancelsOnlyHisOwnNalog() {
        NalogResponse others = service.create(req(NalogStatus.DISPATCHED, 3L), null, admin);
        assertEquals(404, assertThrows(NalogException.class,
                () -> service.changeStatus(others.id(), NalogStatus.CANCELLED, "x", tech2)).getStatus().value());
        assertEquals(NalogStatus.DISPATCHED, service.get(others.id(), admin).status());
    }

    @Test
    void aTechnicianCanCancelFromAnyWorkingStatus() {
        NalogResponse n = service.create(req(NalogStatus.DISPATCHED, 2L), null, admin);
        service.changeStatus(n.id(), NalogStatus.TESTING, null, tech2);
        assertEquals(NalogStatus.CANCELLED, service.changeStatus(n.id(), NalogStatus.CANCELLED, "Kvar nije popravljiv", tech2).status());
    }

    @Test
    void cancelIsFinalAndNeedsNoPhotosOrKonstatacija() {
        NalogResponse n = service.create(req(NalogStatus.DISPATCHED, 2L), null, admin);
        service.changeStatus(n.id(), NalogStatus.CANCELLED, "Odustao", admin);               // no photos, no notes: fine

        for (NalogStatus s : NalogStatus.values()) {
            if (s == NalogStatus.CANCELLED) continue;
            assertEquals(409, assertThrows(NalogException.class,
                    () -> service.changeStatus(n.id(), s, "x", admin)).getStatus().value(), "to " + s);
        }
        // a repeated cancel is an idempotent no-op that keeps the first reason
        assertEquals("Odustao", service.changeStatus(n.id(), NalogStatus.CANCELLED, "Drugi razlog", admin).cancelReason());
    }

    @Test
    void theCancelReasonIsOnlyKeptForCancelledNalozi() {
        NalogResponse n = service.create(req(NalogStatus.DISPATCHED, 2L), null, admin);
        assertNull(service.changeStatus(n.id(), NalogStatus.IN_PROGRESS, "ignored", tech2).cancelReason());
    }

    // ---------------------------------------------------------------- access

    @Test
    void technicianDoesNotSeeSomeoneElsesNalog() {
        NalogResponse others = service.create(req(null, 3L), null, admin);
        NalogResponse mine = service.create(req(null, 2L), null, admin);

        assertEquals(404, assertThrows(NalogException.class, () -> service.get(others.id(), tech2)).getStatus().value());
        assertEquals(404, assertThrows(NalogException.class,
                () -> service.changeStatus(others.id(), NalogStatus.DISPATCHED, null, tech2)).getStatus().value());
        assertEquals(mine.id(), service.get(mine.id(), tech2).id());

        var listed = service.list(null, null, null, null, null, 0, 50, tech2);
        assertEquals(1, listed.items().size());
        assertEquals(2, service.list(null, null, null, null, null, 0, 50, admin).items().size());
    }

    @Test
    void listCanBeSearchedByDeviceAndFilteredByDate() {
        service.create(req("AIR_CONDITIONER", null, null), null, admin);
        jdbc.update("INSERT INTO appliance_type_custom (name) VALUES ('Perilica sudova')");
        service.create(req("Perilica sudova", null, null), null, admin);

        assertEquals(1, service.list(null, "perilica", null, null, null, 0, 50, admin).items().size());     // custom type name
        assertEquals(1, service.list(null, "klima", null, null, null, 0, 50, admin).items().size());     // built-in type, by its Serbian name
        assertEquals(2, service.list(null, "gorenje", null, null, null, 0, 50, admin).items().size());     // brand

        Instant now = Instant.now();
        assertEquals(2, service.list(null, null, null, now.minusSeconds(3600), now.plusSeconds(3600), 0, 50, admin).items().size());
        assertEquals(0, service.list(null, null, null, now.plusSeconds(3600), null, 0, 50, admin).items().size());
        assertEquals(0, service.list(null, null, null, null, now.minusSeconds(3600), 0, 50, admin).items().size());
    }

    @Test
    void onlyAdminAssignsAndOnlyToActiveTechnicians() {
        NalogResponse n = service.create(req(), null, admin);
        assertEquals(403, assertThrows(NalogException.class, () -> service.assign(n.id(), 3L, tech2)).getStatus().value());
        assertEquals(400, assertThrows(NalogException.class, () -> service.assign(n.id(), 1L, admin)).getStatus().value());  // admin is not a technician

        assertEquals("Tehničar Tri", service.assign(n.id(), 3L, admin).assignedToName());
        assertNull(service.assign(n.id(), null, admin).assignedToId());

        jdbc.update("UPDATE app_user SET active = FALSE WHERE id = 3");
        assertEquals(400, assertThrows(NalogException.class, () -> service.assign(n.id(), 3L, admin)).getStatus().value());
    }

    @Test
    void closedNalogCannotBeReassignedOrRescheduled() {
        NalogResponse n = service.create(req(), null, admin);
        service.changeStatus(n.id(), NalogStatus.CANCELLED, "Odustao", admin);
        assertEquals(409, assertThrows(NalogException.class, () -> service.assign(n.id(), 2L, admin)).getStatus().value());
        assertEquals(409, assertThrows(NalogException.class,
                () -> service.setSchedule(n.id(), java.time.Instant.now(), admin)).getStatus().value());
    }
}
