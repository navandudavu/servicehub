package rs.elgor.nalog;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.dto.NalogStats;
import rs.elgor.nalog.service.NalogStatsService;

import static org.junit.jupiter.api.Assertions.*;

class StatsHoursIntegrationTest extends AbstractIntegrationTest {

    @Autowired NalogStatsService stats;

    @Test
    void everyActiveTechnicianIsListedEvenWithZeroHours() {
        insertUser(1, "Admin", "admin");
        insertUser(2, "Tehničar Dva", "technician");
        insertUser(3, "Tehničar Tri", "technician");
        NalogStats s = stats.stats(new AuthUser(1, "Admin", "admin"));
        assertEquals(2, s.hoursByTechnician().size());
        assertTrue(s.hoursByTechnician().stream().allMatch(t -> t.totalHours().signum() == 0));
        assertTrue(s.hoursByTechnician().stream().anyMatch(t -> t.name().equals("Tehničar Dva")));
    }

    @Test
    void inactiveTechnicianWithoutNalozisIsHidden() {
        insertUser(1, "Admin", "admin");
        insertUser(2, "Aktivan", "technician");
        jdbc.update("INSERT INTO app_user (id, name, role, active) VALUES (3, 'Neaktivan', 'technician', FALSE)");
        NalogStats s = stats.stats(new AuthUser(1, "Admin", "admin"));
        assertEquals(1, s.hoursByTechnician().size());
    }
}
