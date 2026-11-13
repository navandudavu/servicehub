package rs.elgor.nalog;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.dto.CustomerDtos.CustomerDetail;
import rs.elgor.nalog.dto.CustomerDtos.CustomerRequest;
import rs.elgor.nalog.dto.NalogResponse.CustomerView;
import rs.elgor.nalog.service.CustomerService;
import rs.elgor.nalog.service.NalogException;

import static org.junit.jupiter.api.Assertions.*;

class CustomerIntegrationTest extends AbstractIntegrationTest {

    @Autowired CustomerService customers;

    private final AuthUser admin = new AuthUser(1, "Admin", "admin");
    private final AuthUser tech = new AuthUser(2, "Tech", "technician");

    private CustomerView make(String name) {
        return customers.create(new CustomerRequest(name, "Cara Lazara 1", "Kruševac", "060 123 456", "", null));
    }

    @Test
    void createListSearchUpdate() {
        CustomerView c = make("Petar Petrović");
        make("Mika Mikić");
        assertEquals(2, customers.list(null).size());
        assertEquals(1, customers.list("petar").size());
        assertEquals(2, customers.list("060").size());                          // both share the phone number
        CustomerView u = customers.update(c.id(), new CustomerRequest("Petar P.", "Nova 5", null, "061", null, null));
        assertEquals("Petar P.", u.fullName());
        assertNull(u.email());
    }

    @Test
    void searchFindsByStreetAndCity() {
        customers.create(new CustomerRequest("Petar Petrović", "Cara Lazara 1", "Kruševac", "060 111", "", null));
        customers.create(new CustomerRequest("Mika Mikić", "Njegoševa 7", "Niš", "060 222", "", null));
        assertEquals(1, customers.list("lazara").size());
        assertEquals(1, customers.list("niš").size());
        assertEquals(1, customers.list("KRUŠEVAC").size());
        assertEquals(0, customers.list("beograd").size());
    }

    @Test
    void emptyCustomerHistoryAndDeleteRules() {
        CustomerView c = make("Petar Petrović");
        CustomerDetail d = customers.get(c.id(), tech);
        assertTrue(d.nalozi().isEmpty());
        assertEquals(403, assertThrows(NalogException.class, () -> customers.delete(c.id(), tech)).getStatus().value());
        customers.delete(c.id(), admin);
        assertEquals(404, assertThrows(NalogException.class, () -> customers.get(c.id(), admin)).getStatus().value());
    }

    @Test
    void aCustomerWithANalogCannotBeDeleted() {
        CustomerView c = make("Petar Petrović");
        insertUser(1, "Admin", "admin");
        jdbc.update("INSERT INTO nalog (nalog_number, customer_id, appliance_type, appliance_brand, diagnosis, labor_hours, labor_rate, labor_total, "
                + "parts_total, subtotal, vat_rate, vat_amount, total, payment_type, status) "
                + "VALUES ('N-T-1', ?, 'OTHER', 'X', 'd', 0, 0, 0, 0, 0, 0.2, 0, 0, 'CASH', 'DRAFT')", c.id());
        NalogException e = assertThrows(NalogException.class, () -> customers.delete(c.id(), admin));
        assertEquals(409, e.getStatus().value());
        assertEquals(1, customers.get(c.id(), admin).nalozi().size());
        assertEquals(0, customers.get(c.id(), tech).nalozi().size());          // a technician sees only their own nalozi
    }
}
