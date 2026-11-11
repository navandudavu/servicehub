package rs.elgor.nalog;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.dto.BulkDtos.BulkCustomerDelete;
import rs.elgor.nalog.dto.CustomerDtos.CustomerRequest;
import rs.elgor.nalog.service.CustomerService;
import rs.elgor.nalog.service.NalogDeleteService;
import rs.elgor.nalog.service.NalogException;
import rs.elgor.nalog.service.NalogService;
import rs.elgor.nalog.service.PartService;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class BulkActionsIntegrationTest extends AbstractIntegrationTest {

    @Autowired NalogDeleteService deleteService;
    @Autowired NalogService nalogService;
    @Autowired PartService partService;
    @Autowired CustomerService customers;

    private final AuthUser admin = new AuthUser(1, "Admin", "admin");
    private final AuthUser tech = new AuthUser(2, "Tech", "technician");

    private long customer() {
        return jdbc.queryForObject("INSERT INTO customer (full_name, phone, address) VALUES ('Petar Petrović', '060', 'Ulica 1') RETURNING id", Long.class);
    }

    private long nalog(String number, long customerId, String status) {
        return jdbc.queryForObject("INSERT INTO nalog (nalog_number, customer_id, appliance_type, appliance_brand, diagnosis, labor_hours, labor_rate, "
                + "labor_total, parts_total, subtotal, vat_rate, vat_amount, total, payment_type, status) "
                + "VALUES (?, ?, 'OTHER', 'X', 'd', 0, 0, 0, 0, 0, 0.2, 0, 0, 'CASH', ?) RETURNING id", Long.class, number, customerId, status);
    }

    private int countNalozi() {
        return jdbc.queryForObject("SELECT count(*) FROM nalog", Integer.class);
    }

    @Test
    void bulkDeleteRefusesEverythingWhenOneIsCompleted() {
        insertUser(1, "Admin", "admin");
        long c = customer();
        long a = nalog("N-A", c, "DRAFT");
        long b = nalog("N-B", c, "COMPLETED");

        NalogException e = assertThrows(NalogException.class, () -> deleteService.deleteMany(List.of(a, b), admin));
        assertEquals(409, e.getStatus().value());
        assertTrue(e.getMessage().contains("N-B"));
        assertEquals(2, countNalozi());                       // nothing was deleted, not even the DRAFT
    }

    @Test
    void bulkDeleteRemovesTheSelectionAndIsAdminOnly() {
        insertUser(1, "Admin", "admin");
        insertUser(2, "Tech", "technician");
        long c = customer();
        long a = nalog("N-A", c, "DRAFT");
        long b = nalog("N-B", c, "DISPATCHED");
        long keep = nalog("N-C", c, "DRAFT");

        assertEquals(403, assertThrows(NalogException.class, () -> deleteService.deleteMany(List.of(a), tech)).getStatus().value());
        assertEquals(2, deleteService.deleteMany(List.of(a, b, a), admin));   // duplicates count once
        assertEquals(1, countNalozi());
        assertEquals(keep, jdbc.queryForObject("SELECT id FROM nalog", Long.class));
        assertEquals(404, assertThrows(NalogException.class, () -> deleteService.deleteMany(List.of(keep, 999_999L), admin)).getStatus().value());
        assertEquals(1, countNalozi());
    }

    @Test
    void bulkAssignIsAllOrNothing() {
        insertUser(1, "Admin", "admin");
        insertUser(2, "Tech", "technician");
        long c = customer();
        long a = nalog("N-A", c, "DISPATCHED");
        long b = nalog("N-B", c, "IN_PROGRESS");
        long done = nalog("N-D", c, "COMPLETED");

        NalogException e = assertThrows(NalogException.class, () -> nalogService.assignMany(List.of(a, done), 2L, admin));
        assertEquals(409, e.getStatus().value());
        assertNull(jdbc.queryForObject("SELECT assigned_to_id FROM nalog WHERE id = ?", Long.class, a));   // untouched

        assertEquals(2, nalogService.assignMany(List.of(a, b), 2L, admin));
        assertEquals(2L, jdbc.queryForObject("SELECT assigned_to_id FROM nalog WHERE id = ?", Long.class, a));
        assertEquals("Tech", jdbc.queryForObject("SELECT assigned_to_name FROM nalog WHERE id = ?", String.class, b));
        assertEquals(2, nalogService.assignMany(List.of(a, b), null, admin));                               // un-assign
        assertNull(jdbc.queryForObject("SELECT assigned_to_id FROM nalog WHERE id = ?", Long.class, a));
        assertEquals(403, assertThrows(NalogException.class, () -> nalogService.assignMany(List.of(a), 2L, tech)).getStatus().value());
    }

    @Test
    void bulkActivateAndDeactivateParts() {
        long p1 = insertPart("A-1", "10.00", 5);
        long p2 = insertPart("A-2", "20.00", 5);

        assertEquals(2, partService.setActiveMany(List.of(p1, p2), false));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM parts WHERE active", Integer.class));
        assertEquals(404, assertThrows(NalogException.class, () -> partService.setActiveMany(List.of(p1, 999_999L), true)).getStatus().value());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM parts WHERE active", Integer.class));      // all or nothing
        assertEquals(2, partService.setActiveMany(List.of(p1, p2), true));
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM parts WHERE active", Integer.class));
    }

    @Test
    void bulkDeleteCustomersSkipsTheOnesWithNalozi() {
        insertUser(1, "Admin", "admin");
        insertUser(2, "Tech", "technician");
        long free1 = customers.create(new CustomerRequest("Slobodan", "A 1", null, "060 111", null, null)).id();
        long free2 = customers.create(new CustomerRequest("Slobodna", "A 2", null, "060 222", null, null)).id();
        long busy = customer();
        nalog("N-X", busy, "DRAFT");

        assertEquals(403, assertThrows(NalogException.class, () -> customers.deleteMany(List.of(free1), tech)).getStatus().value());
        BulkCustomerDelete r = customers.deleteMany(List.of(free1, free2, busy, 999_999L), admin);

        assertEquals(2, r.deleted());
        assertEquals(2, r.skipped().size());
        assertTrue(r.skipped().stream().anyMatch(s -> s.id() == busy && s.reason().equals("HAS_NALOZI") && s.fullName().equals("Petar Petrović")));
        assertTrue(r.skipped().stream().anyMatch(s -> s.id() == 999_999L && s.reason().equals("NOT_FOUND")));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM customer", Integer.class));
    }
}
