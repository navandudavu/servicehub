package rs.elgor.nalog;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import rs.elgor.nalog.domain.ApplianceType;
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
import java.util.List;

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

    private NalogResponse create(List<PartLineInput> parts, Long assignTo) {
        return service.create(new CreateNalogRequest(null, someone(),
                new ApplianceInput(ApplianceType.AIR_CONDITIONER, "Gorenje", "X1", "SN1"),
                "Ne hladi", parts, new BigDecimal("1.50"), PaymentType.CASH, null, null, assignTo), null, admin);
    }

    private UpdateNalogRequest edit(NalogResponse n, List<PartLineInput> parts, String hours) {
        return new UpdateNalogRequest(n.customer().id(), null,
                new ApplianceInput(ApplianceType.AIR_CONDITIONER, "Bosch", null, null),
                "Novi opis", parts, new BigDecimal(hours), PaymentType.CASH, n.version());
    }

    private static NalogResponse.PartLineView line(NalogResponse n, long partId) {
        return n.partLines().stream().filter(l -> l.partId().equals(partId)).findFirst().orElseThrow();
    }

    private int ledger(long partId, String reason) {
        Integer v = jdbc.queryForObject(
                "SELECT coalesce(sum(delta), 0) FROM stock_movement WHERE part_id = ? AND reason = ?", Integer.class, partId, reason);
        return v == null ? 0 : v;
    }

    // ---------------------------------------------------------------- edit

    @Test
    void editReconcilesStockKeepsSnapshotPricesAndRates() {
        long a = insertPart("A", "100.00", 10);
        long b = insertPart("B", "50.00", 5);
        NalogResponse n = create(List.of(new PartLineInput(a, 2)), null);        // stock A = 8
        jdbc.update("UPDATE parts SET unit_price = 200.00 WHERE id = ?", a);       // catalogue price changes afterwards

        NalogResponse e = service.update(n.id(), edit(n, List.of(new PartLineInput(a, 5), new PartLineInput(b, 1)), "2.00"), admin);

        assertEquals(5, stockOf(a));                                // 8 - 3 more
        assertEquals(4, stockOf(b));
        assertEquals(new BigDecimal("100.00"), line(e, a).unitPrice());           // old line keeps ITS price
        assertEquals(new BigDecimal("500.00"), line(e, a).lineTotal());
        assertEquals(new BigDecimal("50.00"), line(e, b).unitPrice());            // new part: today's price
        assertEquals(new BigDecimal("550.00"), e.partsTotal());
        assertEquals(new BigDecimal("5000.00"), e.laborTotal());                  // 2 h * 2500
        assertEquals(new BigDecimal("5550.00"), e.subtotal());
        assertEquals(new BigDecimal("1110.00"), e.vatAmount());
        assertEquals(new BigDecimal("6660.00"), e.total());
        assertEquals("Novi opis", e.diagnosis());
        assertTrue(e.version() > n.version());
        assertEquals(-3, ledger(a, "NALOG_EDIT"));
        assertEquals(-1, ledger(b, "NALOG_EDIT"));
    }

    @Test
    void editKeepsTheRatesTheNalogWasCreatedWith() {
        NalogResponse n = create(List.of(), null);
        jdbc.update("UPDATE nalog SET labor_rate = 3000.00 WHERE id = ?", n.id());       // pretend the rate was different back then
        NalogResponse e = service.update(n.id(), edit(service.get(n.id(), admin), List.of(), "1.00"), admin);
        assertEquals(new BigDecimal("3000.00"), e.laborRate());
        assertEquals(new BigDecimal("3000.00"), e.laborTotal());
        assertEquals(new BigDecimal("3600.00"), e.total());                                // + 20% VAT
    }

    @Test
    void removingAPartGivesTheStockBack() {
        long a = insertPart("A", "100.00", 10);
        NalogResponse n = create(List.of(new PartLineInput(a, 3)), null);
        assertEquals(7, stockOf(a));

        NalogResponse e = service.update(n.id(), edit(n, List.of(), "1.50"), admin);

        assertEquals(10, stockOf(a));
        assertTrue(e.partLines().isEmpty());
        assertEquals(new BigDecimal("0.00"), e.partsTotal());
        assertEquals(0, count("nalog_part_line"));
        assertEquals(3, ledger(a, "NALOG_EDIT"));
    }

    @Test
    void editBeyondStockRollsBackEverything() {
        long a = insertPart("A", "100.00", 3);
        NalogResponse n = create(List.of(new PartLineInput(a, 2)), null);          // stock A = 1
        UpdateNalogRequest tooMuch = new UpdateNalogRequest(null, someone(),
                new ApplianceInput(ApplianceType.AIR_CONDITIONER, "Bosch", null, null),
                "Novi opis", List.of(new PartLineInput(a, 5)), new BigDecimal("1.00"), PaymentType.CASH, n.version());

        NalogException ex = assertThrows(NalogException.class, () -> service.update(n.id(), tooMuch, admin));

        assertEquals(409, ex.getStatus().value());
        assertEquals(1, stockOf(a));
        assertEquals(2, jdbc.queryForObject("SELECT quantity FROM nalog_part_line WHERE nalog_id = ?", Integer.class, n.id()));
        assertEquals("Ne hladi", jdbc.queryForObject("SELECT diagnosis FROM nalog WHERE id = ?", String.class, n.id()));
        assertEquals(1, count("customer"));                                         // the would-be new customer was rolled back too
        assertEquals(0, ledger(a, "NALOG_EDIT"));
    }

    @Test
    void aStaleFormIsRejected() {
        NalogResponse n = create(List.of(), null);
        service.update(n.id(), edit(n, List.of(), "1.00"), admin);                  // someone else saves first
        NalogException ex = assertThrows(NalogException.class, () -> service.update(n.id(), edit(n, List.of(), "2.00"), admin));
        assertEquals(409, ex.getStatus().value());
    }

    @Test
    void finishedAndCancelledNaloziCannotBeEdited() {
        NalogResponse cancelled = create(List.of(), null);
        service.changeStatus(cancelled.id(), NalogStatus.CANCELLED, admin);
        assertEquals(409, assertThrows(NalogException.class,
                () -> service.update(cancelled.id(), edit(service.get(cancelled.id(), admin), List.of(), "1.00"), admin)).getStatus().value());

        NalogResponse done = create(List.of(), null);
        service.changeStatus(done.id(), NalogStatus.DISPATCHED, admin);
        service.changeStatus(done.id(), NalogStatus.IN_PROGRESS, admin);
        service.changeStatus(done.id(), NalogStatus.COMPLETED, admin);
        assertEquals(409, assertThrows(NalogException.class,
                () -> service.update(done.id(), edit(service.get(done.id(), admin), List.of(), "1.00"), admin)).getStatus().value());
    }

    @Test
    void aTechnicianEditsOnlyTheirOwnNalog() {
        NalogResponse n = create(List.of(), 2L);
        assertEquals(404, assertThrows(NalogException.class, () -> service.update(n.id(), edit(n, List.of(), "1.00"), tech3)).getStatus().value());
        assertEquals("Novi opis", service.update(n.id(), edit(n, List.of(), "1.00"), tech2).diagnosis());
    }

    @Test
    void switchingToANewCustomerLeavesTheOldRecordAlone() {
        NalogResponse n = create(List.of(), null);
        UpdateNalogRequest req = new UpdateNalogRequest(null,
                new CustomerInput("Marko Marković", "Vidovdanska 5", "Kruševac", "063 555 111", null, null),
                new ApplianceInput(ApplianceType.AIR_CONDITIONER, "Bosch", null, null),
                "Novi opis", List.of(), new BigDecimal("1.00"), PaymentType.CASH, n.version());
        NalogResponse e = service.update(n.id(), req, admin);

        assertNotEquals(n.customer().id(), e.customer().id());
        assertEquals("Marko Marković", e.customer().fullName());
        assertEquals(2, count("customer"));
    }

    @Test
    void previewWhileEditingUsesTheNalogsOwnPricesAndDoesNotDoubleCountItsStock() {
        long a = insertPart("A", "100.00", 3);
        NalogResponse n = create(List.of(new PartLineInput(a, 3)), null);          // stock A = 0
        jdbc.update("UPDATE parts SET unit_price = 999.00 WHERE id = ?", a);
        jdbc.update("UPDATE nalog SET labor_rate = 3000.00 WHERE id = ?", n.id());

        NalogPreview p = service.preview(new PreviewRequest(List.of(new PartLineInput(a, 3)), new BigDecimal("1.00"), n.id()), admin);
        assertEquals(new BigDecimal("300.00"), p.partsTotal());                    // snapshot price, and no false "out of stock"
        assertEquals(new BigDecimal("3000.00"), p.laborTotal());

        assertThrows(NalogException.class,                                          // a brand-new nalog really is out of stock
                () -> service.preview(new PreviewRequest(List.of(new PartLineInput(a, 3)), new BigDecimal("1.00"), null), admin));
    }

    // ---------------------------------------------------------------- delete

    @Test
    void deletingGivesStockBackRemovesEverythingAndKeepsAnAuditLine() throws Exception {
        long a = insertPart("A", "100.00", 10);
        NalogResponse n = create(List.of(new PartLineInput(a, 4)), null);          // stock A = 6
        jdbc.update("INSERT INTO nalog_note (nalog_id, author_name, body) VALUES (?, 'x', 'y')", n.id());
        Path dir = Path.of(System.getProperty("java.io.tmpdir"), "nalog-test-photos");
        Files.createDirectories(dir);
        Path file = dir.resolve("delete-me.png");
        Files.write(file, new byte[]{1, 2, 3});
        jdbc.update("INSERT INTO nalog_photo (nalog_id, filename, content_type, size_bytes) VALUES (?, 'delete-me.png', 'image/png', 3)", n.id());

        deleteService.delete(n.id(), admin);

        assertEquals(10, stockOf(a));
        assertEquals(0, count("nalog"));
        assertEquals(0, count("nalog_part_line"));
        assertEquals(0, count("nalog_note"));
        assertEquals(0, count("nalog_photo"));
        assertEquals(0, count("nalog_status_history"));
        assertFalse(Files.exists(file), "the image file must be removed after the commit");
        assertEquals(1, count("nalog_deleted_log"));
        assertEquals(4, ledger(a, "NALOG_DELETE"));
        assertEquals(1, jdbc.queryForObject(
                "SELECT count(*) FROM stock_movement WHERE reason = 'NALOG_DELETE' AND nalog_id IS NULL", Integer.class));
    }

    @Test
    void deletingACancelledNalogDoesNotReturnStockTwice() {
        long a = insertPart("A", "100.00", 10);
        NalogResponse n = create(List.of(new PartLineInput(a, 4)), null);
        service.changeStatus(n.id(), NalogStatus.CANCELLED, admin);                  // stock back to 10
        deleteService.delete(n.id(), admin);
        assertEquals(10, stockOf(a));
        assertEquals(0, ledger(a, "NALOG_DELETE"));
        assertEquals("CANCELLED", jdbc.queryForObject("SELECT status FROM nalog_deleted_log", String.class));
    }

    @Test
    void completedCannotBeDeletedAndTechniciansCannotDeleteAtAll() {
        NalogResponse done = create(List.of(), 2L);
        service.changeStatus(done.id(), NalogStatus.DISPATCHED, admin);
        service.changeStatus(done.id(), NalogStatus.IN_PROGRESS, admin);
        service.changeStatus(done.id(), NalogStatus.COMPLETED, admin);
        assertEquals(409, assertThrows(NalogException.class, () -> deleteService.delete(done.id(), admin)).getStatus().value());

        NalogResponse open = create(List.of(), 2L);
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
        NalogResponse n = create(List.of(), 2L);
        String body = "{\"customerId\":" + n.customer().id() + ",\"appliance\":{\"type\":\"AIR_CONDITIONER\",\"brand\":\"Bosch\"},"
                + "\"diagnosis\":\"d\",\"partLines\":[],\"laborHours\":\"1.00\",\"paymentType\":\"CASH\",\"expectedVersion\":" + n.version() + "}";

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
