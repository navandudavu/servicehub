package rs.elgor.nalog;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.domain.NalogStatus;
import rs.elgor.nalog.domain.PaymentType;
import rs.elgor.nalog.dto.CreateNalogRequest;
import rs.elgor.nalog.dto.CreateNalogRequest.*;
import rs.elgor.nalog.dto.NalogPreview;
import rs.elgor.nalog.dto.NalogResponse;
import rs.elgor.nalog.dto.PreviewRequest;
import rs.elgor.nalog.dto.UpdateNalogRequest;
import rs.elgor.nalog.service.NalogDeleteService;
import rs.elgor.nalog.service.NalogException;
import rs.elgor.nalog.service.NalogService;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.is;

@AutoConfigureMockMvc
class NalogEditDeleteIntegrationTest extends AbstractIntegrationTest {

    @Autowired NalogService service;
    @Autowired NalogDeleteService deleteService;
    @Autowired MockMvc mvc;

    AuthUser admin = new AuthUser(1, "Admin", "admin");
    AuthUser tech2 = new AuthUser(2, "Tehničar Dva", "technician");
    AuthUser tech3 = new AuthUser(3, "Tehničar Tri", "technician");

    @BeforeEach
    void users() {
        insertUser(1, "Admin", "admin");
        insertUser(2, "Tehničar Dva", "technician");
        insertUser(3, "Tehničar Tri", "technician");
    }

    private CustomerInput someone() {
        return new CustomerInput("Petar Petrović", "Cara Lazara 1", "Kruševac", "060 123 456", null, null);
    }

    private NalogResponse create(Long assignTo) {
        return service.create(new CreateNalogRequest(null, someone(),
                new ApplianceInput("AIR_CONDITIONER", "Gorenje", "X1", "SN1"),
                "Ne hladi", new BigDecimal("1.50"), new BigDecimal("8000.00"), PaymentType.CASH, null, null, assignTo), null, admin);
    }

    private UpdateNalogRequest edit(NalogResponse n, String hours) {
        return new UpdateNalogRequest(n.customer().id(), null,
                new ApplianceInput("AIR_CONDITIONER", "Bosch", null, null),
                "Novi opis", new BigDecimal(hours), null, PaymentType.CASH, n.version());
    }

    // ---------------------------------------------------------------- edit

    @Test
    void editKeepsThePriceWhenNoneIsSent() {
        NalogResponse n = create(null);
        NalogResponse e = service.update(n.id(), edit(n, "2.00"), admin);

        assertEquals(new BigDecimal("8000.00"), e.total());                       // no price sent on edit: the nalog keeps its price
        assertEquals("Novi opis", e.diagnosis());
        assertTrue(e.version() > n.version());
    }

    @Test
    void editCanChangeThePriceByHand() {
        NalogResponse n = create(null);
        UpdateNalogRequest req = new UpdateNalogRequest(n.customer().id(), null,
                new ApplianceInput("AIR_CONDITIONER", "Bosch", null, null),
                "Novi opis", new BigDecimal("1.00"), new BigDecimal("4321.50"), PaymentType.CASH, n.version());
        NalogResponse e = service.update(n.id(), req, admin);
        assertEquals(new BigDecimal("4321.50"), e.total());
        assertEquals(new BigDecimal("0.00"), e.vatAmount());
    }

    @Test
    void aFailedEditRollsEverythingBack() {
        NalogResponse n = create(null);
        UpdateNalogRequest bad = new UpdateNalogRequest(null, someone(),
                new ApplianceInput("PERILICA_SUDA", "Bosch", null, null),          // unknown device type
                "Novi opis", new BigDecimal("1.00"), null, PaymentType.CASH, n.version());

        assertEquals(400, assertThrows(NalogException.class, () -> service.update(n.id(), bad, admin)).getStatus().value());

        assertEquals("Ne hladi", jdbc.queryForObject("SELECT diagnosis FROM nalog WHERE id = ?", String.class, n.id()));
        assertEquals(1, count("customer"));                                         // the would-be new customer was rolled back too
    }

    @Test
    void aStaleFormIsRejected() {
        NalogResponse n = create(null);
        service.update(n.id(), edit(n, "1.00"), admin);                             // someone else saves first
        NalogException ex = assertThrows(NalogException.class, () -> service.update(n.id(), edit(n, "2.00"), admin));
        assertEquals(409, ex.getStatus().value());
    }

    @Test
    void finishedAndCancelledNaloziCannotBeEdited() {
        NalogResponse cancelled = create(null);
        service.changeStatus(cancelled.id(), NalogStatus.CANCELLED, "Klijent odustao", admin);
        assertEquals(409, assertThrows(NalogException.class,
                () -> service.update(cancelled.id(), edit(service.get(cancelled.id(), admin), "1.00"), admin)).getStatus().value());

        NalogResponse done = create(2L);
        service.changeStatus(done.id(), NalogStatus.DISPATCHED, null, admin);
        service.changeStatus(done.id(), NalogStatus.IN_PROGRESS, null, admin);
        readyToClose(done.id());
        service.changeStatus(done.id(), NalogStatus.COMPLETED, null, admin);
        // a closed nalog can only be printed: nobody edits it, admin included
        assertEquals(409, assertThrows(NalogException.class,
                () -> service.update(done.id(), edit(service.get(done.id(), admin), "1.00"), tech2)).getStatus().value());
        assertEquals(409, assertThrows(NalogException.class,
                () -> service.update(done.id(), edit(service.get(done.id(), admin), "1.00"), admin)).getStatus().value());
    }

    @Test
    void aTechnicianEditsOnlyTheirOwnNalog() {
        NalogResponse n = create(2L);
        assertEquals(404, assertThrows(NalogException.class, () -> service.update(n.id(), edit(n, "1.00"), tech3)).getStatus().value());
        assertEquals("Novi opis", service.update(n.id(), edit(n, "1.00"), tech2).diagnosis());
    }

    @Test
    void switchingToANewCustomerLeavesTheOldRecordAlone() {
        NalogResponse n = create(null);
        UpdateNalogRequest req = new UpdateNalogRequest(null,
                new CustomerInput("Marko Marković", "Vidovdanska 5", "Kruševac", "063 555 111", null, null),
                new ApplianceInput("AIR_CONDITIONER", "Bosch", null, null),
                "Novi opis", new BigDecimal("1.00"), null, PaymentType.CASH, n.version());
        NalogResponse e = service.update(n.id(), req, admin);

        assertNotEquals(n.customer().id(), e.customer().id());
        assertEquals("Marko Marković", e.customer().fullName());
        assertEquals(2, count("customer"));
    }

    @Test
    void previewWhileEditingUsesTheNalogsOwnPrice() {
        NalogResponse n = create(null);
        NalogPreview p = service.preview(new PreviewRequest(new BigDecimal("1.00"), null, n.id()), admin);
        assertEquals(new BigDecimal("8000.00"), p.total());                        // no price sent: the nalog's own price
    }

    // ---------------------------------------------------------------- delete

    @Test
    void deletingRemovesEverythingAndKeepsAnAuditLine() throws Exception {
        NalogResponse n = create(null);
        jdbc.update("INSERT INTO nalog_note (nalog_id, author_name, body) VALUES (?, 'x', 'y')", n.id());
        Path dir = Path.of(System.getProperty("java.io.tmpdir"), "nalog-test-photos");
        Files.createDirectories(dir);
        Path file = dir.resolve("delete-me.png");
        Files.write(file, new byte[]{1, 2, 3});
        jdbc.update("INSERT INTO nalog_photo (nalog_id, filename, content_type, size_bytes) VALUES (?, 'delete-me.png', 'image/png', 3)", n.id());

        deleteService.delete(n.id(), admin);

        assertEquals(0, count("nalog"));
        assertEquals(0, count("nalog_note"));
        assertEquals(0, count("nalog_photo"));
        assertEquals(0, count("nalog_status_history"));
        assertFalse(Files.exists(file), "the image file must be removed after the commit");
        assertEquals(1, count("nalog_deleted_log"));
    }

    @Test
    void completedCannotBeDeletedAndTechniciansCannotDeleteAtAll() {
        NalogResponse done = create(2L);
        service.changeStatus(done.id(), NalogStatus.DISPATCHED, null, admin);
        service.changeStatus(done.id(), NalogStatus.IN_PROGRESS, null, admin);
        readyToClose(done.id());
        service.changeStatus(done.id(), NalogStatus.COMPLETED, null, admin);
        assertEquals(409, assertThrows(NalogException.class, () -> deleteService.delete(done.id(), admin)).getStatus().value());

        NalogResponse open = create(2L);
        assertEquals(403, assertThrows(NalogException.class, () -> deleteService.delete(open.id(), tech2)).getStatus().value());
        assertEquals(2, count("nalog"));
        assertEquals(404, assertThrows(NalogException.class, () -> deleteService.delete(99999L, admin)).getStatus().value());
    }

    // ---------------------------------------------------------------- over HTTP

    private RequestPostProcessor as(long id, String name, String role) {
        return jwt().jwt(j -> j.claim("id", id).claim("name", name).claim("role", role))
                .authorities(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase()));
    }

    @Test
    void putAndDeleteOverHttp() throws Exception {
        NalogResponse n = create(2L);
        String body = "{\"customerId\":" + n.customer().id() + ",\"appliance\":{\"type\":\"AIR_CONDITIONER\",\"brand\":\"Bosch\"},"
                + "\"diagnosis\":\"d\",\"laborHours\":\"1.00\",\"paymentType\":\"CASH\",\"expectedVersion\":" + n.version() + "}";

        mvc.perform(put("/api/nalozi/" + n.id()).with(as(2, "Tehničar Dva", "technician"))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.diagnosis", is("d")));

        String noVersion = body.replaceAll(",\"expectedVersion\":\\d+", "");
        mvc.perform(put("/api/nalozi/" + n.id()).with(as(1, "Admin", "admin"))
                        .contentType(MediaType.APPLICATION_JSON).content(noVersion))
                .andExpect(status().isBadRequest());

        mvc.perform(delete("/api/nalozi/" + n.id()).with(as(2, "Tehničar Dva", "technician"))).andExpect(status().isForbidden());
        mvc.perform(delete("/api/nalozi/" + n.id()).with(as(1, "Admin", "admin"))).andExpect(status().isNoContent());
        mvc.perform(get("/api/nalozi/" + n.id()).with(as(1, "Admin", "admin"))).andExpect(status().isNotFound());
    }
}
