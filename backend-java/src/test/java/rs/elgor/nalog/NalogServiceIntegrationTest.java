package rs.elgor.nalog;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.domain.ApplianceType;
import rs.elgor.nalog.domain.NalogStatus;
import rs.elgor.nalog.domain.PaymentType;
import rs.elgor.nalog.dto.CreateNalogRequest;
import rs.elgor.nalog.dto.CreateNalogRequest.*;
import rs.elgor.nalog.dto.NalogResponse;
import rs.elgor.nalog.service.NalogException;
import rs.elgor.nalog.service.NalogService;

import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class NalogServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired NalogService service;

    AuthUser admin = new AuthUser(1, "Admin", "admin");
    AuthUser tech2 = new AuthUser(2, "Tehničar Dva", "technician");
    AuthUser tech3 = new AuthUser(3, "Tehničar Tri", "technician");

    @BeforeEach
    void users() {
        insertUser(1, "Admin", "admin");
        insertUser(2, "Tehničar Dva", "technician");
        insertUser(3, "Tehničar Tri", "technician");
    }

    private CreateNalogRequest req(List<PartLineInput> parts, NalogStatus status, Long assignTo) {
        return new CreateNalogRequest(null,
                new CustomerInput("Petar Petrović", "Cara Lazara 1", "Kruševac", "060 123 456", null, null),
                new ApplianceInput(ApplianceType.values()[0], "Gorenje", "X1", "SN1"),
                "Ne hladi", parts, new BigDecimal("1.50"), PaymentType.values()[0], status, null, assignTo);
    }

    private CreateNalogRequest req(List<PartLineInput> parts) { return req(parts, null, null); }

    // ---------------------------------------------------------------- create

    @Test
    void createComputesMoneyDecrementsStockAndWritesAudit() {
        long p = insertPart("A-1", "1234.55", 10);
        NalogResponse n = service.create(req(List.of(new PartLineInput(p, 2))), null, admin);

        assertEquals(NalogStatus.DRAFT, n.status());
        assertEquals(new BigDecimal("3750.00"), n.laborTotal());   // 1.5 h * 2500
        assertEquals(new BigDecimal("2469.10"), n.partsTotal());
        assertEquals(new BigDecimal("6219.10"), n.subtotal());
        assertEquals(new BigDecimal("1243.82"), n.vatAmount());
        assertEquals(new BigDecimal("7462.92"), n.total());
        assertEquals(8, stockOf(p));
        assertEquals(1, count("stock_movement"));
        assertEquals(1, count("nalog_status_history"));
    }

    @Test
    void outOfStockRollsBackEverything() {
        long p = insertPart("A-1", "100.00", 1);
        NalogException e = assertThrows(NalogException.class,
                () -> service.create(req(List.of(new PartLineInput(p, 5))), null, admin));

        assertEquals(409, e.getStatus().value());
        assertEquals(1, stockOf(p));
        assertEquals(0, count("nalog"));
        assertEquals(0, count("customer"));          // the new customer must not survive either
        assertEquals(0, count("stock_movement"));
    }

    @Test
    void secondPartFailingDoesNotLeakStockOfTheFirst() {
        long ok = insertPart("OK", "100.00", 10);
        long low = insertPart("LOW", "100.00", 1);
        assertThrows(NalogException.class, () -> service.create(
                req(List.of(new PartLineInput(ok, 3), new PartLineInput(low, 2))), null, admin));

        assertEquals(10, stockOf(ok));
        assertEquals(1, stockOf(low));
        assertEquals(0, count("nalog"));
    }

    @Test
    void sameIdempotencyKeyCreatesOnlyOneNalog() {
        long p = insertPart("A-1", "100.00", 10);
        NalogResponse a = service.create(req(List.of(new PartLineInput(p, 2))), "key-1", admin);
        NalogResponse b = service.create(req(List.of(new PartLineInput(p, 2))), "key-1", admin);

        assertEquals(a.id(), b.id());
        assertEquals(1, count("nalog"));
        assertEquals(8, stockOf(p));                 // decremented once, not twice
    }

    @Test
    void newNalogCannotStartInProgress() {
        NalogException e = assertThrows(NalogException.class,
                () -> service.create(req(List.of(), NalogStatus.IN_PROGRESS, null), null, admin));
        assertEquals(400, e.getStatus().value());
    }

    @Test
    void technicianCanOnlyAssignToSelf() {
        NalogException e = assertThrows(NalogException.class,
                () -> service.create(req(List.of(), null, 3L), null, tech2));
        assertEquals(403, e.getStatus().value());

        NalogResponse mine = service.create(req(List.of()), null, tech2);
        assertEquals(2L, mine.assignedToId());
    }

    @Test
    void lastUnitGoesToExactlyOneOfManyConcurrentRequests() throws Exception {
        long p = insertPart("LAST", "100.00", 1);
        int threads = 6;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch go = new CountDownLatch(1);
        AtomicInteger ok = new AtomicInteger(), conflict = new AtomicInteger();
        List<Future<?>> fs = new java.util.ArrayList<>();
        for (int i = 0; i < threads; i++) {
            fs.add(pool.submit(() -> {
                go.await();
                try {
                    service.create(req(List.of(new PartLineInput(p, 1))), null, admin);
                    ok.incrementAndGet();
                } catch (NalogException e) {
                    if (e.getStatus().value() == 409) conflict.incrementAndGet();
                }
                return null;
            }));
        }
        go.countDown();
        for (Future<?> f : fs) f.get(60, TimeUnit.SECONDS);
        pool.shutdown();

        assertEquals(1, ok.get());
        assertEquals(threads - 1, conflict.get());
        assertEquals(0, stockOf(p));                 // never negative
        assertEquals(1, count("nalog"));
    }

    // ---------------------------------------------------------------- status machine

    @Test
    void walksTheHappyPathAndStampsCompletion() {
        NalogResponse n = service.create(req(List.of()), null, admin);
        service.changeStatus(n.id(), NalogStatus.DISPATCHED, admin);
        service.changeStatus(n.id(), NalogStatus.IN_PROGRESS, admin);
        service.changeStatus(n.id(), NalogStatus.AWAITING_PARTS, admin);
        service.changeStatus(n.id(), NalogStatus.IN_PROGRESS, admin);
        NalogResponse done = service.changeStatus(n.id(), NalogStatus.COMPLETED, admin);

        assertEquals(NalogStatus.COMPLETED, done.status());
        assertNotNull(done.completedAt());
        assertEquals(6, service.history(n.id(), admin).size());
    }

    @Test
    void illegalTransitionsAreRejected() {
        NalogResponse n = service.create(req(List.of()), null, admin);
        NalogException e = assertThrows(NalogException.class,
                () -> service.changeStatus(n.id(), NalogStatus.COMPLETED, admin));
        assertEquals(409, e.getStatus().value());

        service.changeStatus(n.id(), NalogStatus.CANCELLED, admin);
        assertThrows(NalogException.class, () -> service.changeStatus(n.id(), NalogStatus.DISPATCHED, admin));
    }

    @Test
    void cancelRestoresStockOnceAndOnlyAdminMayCancel() {
        long p = insertPart("A-1", "100.00", 10);
        NalogResponse n = service.create(req(List.of(new PartLineInput(p, 4))), null, tech2);
        assertEquals(6, stockOf(p));

        NalogException e = assertThrows(NalogException.class,
                () -> service.changeStatus(n.id(), NalogStatus.CANCELLED, tech2));
        assertEquals(403, e.getStatus().value());
        assertEquals(6, stockOf(p));

        service.changeStatus(n.id(), NalogStatus.CANCELLED, admin);
        service.changeStatus(n.id(), NalogStatus.CANCELLED, admin);   // double click
        assertEquals(10, stockOf(p));                                 // restored once, not twice
    }

    // ---------------------------------------------------------------- access

    @Test
    void technicianDoesNotSeeSomeoneElsesNalog() {
        NalogResponse others = service.create(req(List.of(), null, 3L), null, admin);
        NalogResponse mine = service.create(req(List.of(), null, 2L), null, admin);

        assertEquals(404, assertThrows(NalogException.class, () -> service.get(others.id(), tech2)).getStatus().value());
        assertEquals(404, assertThrows(NalogException.class,
                () -> service.changeStatus(others.id(), NalogStatus.DISPATCHED, tech2)).getStatus().value());
        assertEquals(mine.id(), service.get(mine.id(), tech2).id());

        var listed = service.list(null, null, null, 0, 50, tech2);
        assertEquals(1, listed.items().size());
        assertEquals(2, service.list(null, null, null, 0, 50, admin).items().size());
    }

    @Test
    void onlyAdminAssignsAndOnlyToActiveTechnicians() {
        NalogResponse n = service.create(req(List.of()), null, admin);
        assertEquals(403, assertThrows(NalogException.class, () -> service.assign(n.id(), 3L, tech2)).getStatus().value());
        assertEquals(400, assertThrows(NalogException.class, () -> service.assign(n.id(), 1L, admin)).getStatus().value());  // admin is not a technician

        assertEquals("Tehničar Tri", service.assign(n.id(), 3L, admin).assignedToName());
        assertNull(service.assign(n.id(), null, admin).assignedToId());

        jdbc.update("UPDATE app_user SET active = FALSE WHERE id = 3");
        assertEquals(400, assertThrows(NalogException.class, () -> service.assign(n.id(), 3L, admin)).getStatus().value());
    }

    @Test
    void closedNalogCannotBeReassignedOrRescheduled() {
        NalogResponse n = service.create(req(List.of()), null, admin);
        service.changeStatus(n.id(), NalogStatus.CANCELLED, admin);
        assertEquals(409, assertThrows(NalogException.class, () -> service.assign(n.id(), 2L, admin)).getStatus().value());
        assertEquals(409, assertThrows(NalogException.class,
                () -> service.setSchedule(n.id(), java.time.Instant.now(), admin)).getStatus().value());
    }
}
