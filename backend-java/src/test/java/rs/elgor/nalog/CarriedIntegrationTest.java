package rs.elgor.nalog;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.dto.CarriedDtos.CarriedRequest;
import rs.elgor.nalog.dto.CarriedDtos.CarriedView;
import rs.elgor.nalog.service.CarriedItemService;
import rs.elgor.nalog.service.NalogException;

import static org.junit.jupiter.api.Assertions.*;

/** Zaduzivanje: each technician has his own list, capped at 50, no link to the warehouse. */
class CarriedIntegrationTest extends AbstractIntegrationTest {

    @Autowired CarriedItemService service;

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

    private CarriedRequest item(String name, int qty) {
        return new CarriedRequest("  K-1 ", name, qty, null);
    }

    @Test
    void technicianKeepsHisOwnListAndSeesNobodyElses() {
        CarriedView a = service.add(item("Kondenzator", 3), tech2);
        service.add(item("Relej", 1), tech3);

        assertEquals(2L, a.technicianId());
        assertEquals("K-1", a.sku());                                     // trimmed
        assertEquals(1, service.list(null, tech2).size());
        assertEquals("Kondenzator", service.list(null, tech2).get(0).name());
        assertEquals(403, assertThrows(NalogException.class, () -> service.list(3L, tech2)).getStatus().value());

        // somebody else's item is simply not there
        CarriedView theirs = service.list(null, tech3).get(0);
        assertEquals(404, assertThrows(NalogException.class, () -> service.update(theirs.id(), item("X", 1), tech2)).getStatus().value());
        assertEquals(404, assertThrows(NalogException.class, () -> service.delete(theirs.id(), tech2)).getStatus().value());
    }

    @Test
    void updateAndDeleteWork() {
        CarriedView a = service.add(item("Kondenzator", 3), tech2);
        CarriedView b = service.update(a.id(), new CarriedRequest(null, "Kondenzator 35uF", 5, null), tech2);
        assertEquals("Kondenzator 35uF", b.name());
        assertEquals(5, b.quantity());
        assertNull(b.sku());
        service.delete(a.id(), tech2);
        assertEquals(0, service.list(null, tech2).size());
    }

    @Test
    void adminAndManagerManageAnybodysListButMustSayWhose() {
        CarriedView a = service.add(new CarriedRequest(null, "Creva", 10, 2L), admin);
        assertEquals(2L, a.technicianId());
        assertEquals(1, service.list(2L, manager).size());
        assertEquals(400, assertThrows(NalogException.class, () -> service.list(null, admin)).getStatus().value());
        assertEquals(400, assertThrows(NalogException.class,
                () -> service.add(new CarriedRequest(null, "X", 1, 4L), admin)).getStatus().value());     // 4 = manager, not a technician
        service.update(a.id(), new CarriedRequest(null, "Creva 1/4", 11, 2L), manager);
        service.delete(a.id(), admin);
    }

    @Test
    void fiftyItemsAtMost() {
        for (int i = 0; i < 50; i++) {
            service.add(item("Stavka " + i, 1), tech2);
        }
        assertEquals(409, assertThrows(NalogException.class, () -> service.add(item("Pedeset prva", 1), tech2)).getStatus().value());
        service.add(item("Tuđa lista nije puna", 1), tech3);
    }

    @Test
    void blankNameIsRejected() {
        assertEquals(400, assertThrows(NalogException.class, () -> service.add(item("   ", 1), tech2)).getStatus().value());
    }
}
