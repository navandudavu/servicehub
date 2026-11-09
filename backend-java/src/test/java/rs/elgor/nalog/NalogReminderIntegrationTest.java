package rs.elgor.nalog;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import rs.elgor.nalog.dto.StaleNalogs;
import rs.elgor.nalog.service.NalogReminderService;
import rs.elgor.nalog.service.PushSender;
import rs.elgor.nalog.service.StaleNalogService;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class NalogReminderIntegrationTest extends AbstractIntegrationTest {

    @Autowired StaleNalogService stale;

    record Sent(long userId, String title, String body, Map<String, String> data) {}

    static class FakeSender implements PushSender {
        final List<Sent> sent = new ArrayList<>();
        @Override public void sendToUser(long userId, String title, String body, Map<String, String> data) {
            sent.add(new Sent(userId, title, body, data));
        }
    }

    private long customer() {
        return jdbc.queryForObject("INSERT INTO customer (full_name, phone, address) VALUES ('Petar Petrović', '060', 'Ulica 1') RETURNING id", Long.class);
    }

    private void nalog(String number, long customerId, Long techId, String status, String updatedAgo) {
        jdbc.update("INSERT INTO nalog (nalog_number, customer_id, appliance_type, appliance_brand, diagnosis, labor_hours, labor_rate, labor_total, "
                + "parts_total, subtotal, vat_rate, vat_amount, total, payment_type, status, assigned_to_id, assigned_to_name, updated_at) "
                + "VALUES (?, ?, 'OTHER', 'X', 'd', 0, 0, 0, 0, 0, 0.2, 0, 0, 'CASH', ?, ?, (SELECT name FROM app_user WHERE id = ?), now() - ?::interval)",
                number, customerId, status, techId, techId, updatedAgo);
    }

    @Test
    void reminderGoesOnlyToActiveTechniciansWithInProgressNalozi() {
        insertUser(1, "Admin", "admin");
        insertUser(2, "Prvi", "technician");
        insertUser(3, "Drugi", "technician");
        insertUser(4, "Treći", "technician");
        jdbc.update("INSERT INTO app_user (id, name, role, active) VALUES (5, 'Neaktivan', 'technician', FALSE)");
        long c = customer();
        nalog("N-1", c, 2L, "IN_PROGRESS", "1 hour");
        nalog("N-2", c, 2L, "IN_PROGRESS", "1 hour");
        nalog("N-3", c, 3L, "DISPATCHED", "1 hour");        // not started: no reminder
        nalog("N-4", c, 4L, "COMPLETED", "1 hour");         // done: no reminder
        nalog("N-5", c, 1L, "IN_PROGRESS", "1 hour");       // admin: no reminder
        nalog("N-6", c, 5L, "IN_PROGRESS", "1 hour");       // inactive technician: no reminder

        FakeSender fake = new FakeSender();
        int n = new NalogReminderService(jdbc, fake, true).sendReminders();

        assertEquals(1, n);
        assertEquals(1, fake.sent.size());
        Sent s = fake.sent.get(0);
        assertEquals(2L, s.userId());
        assertTrue(s.body().contains("2"));
        assertTrue(s.body().contains("zaista završen"));
        assertEquals("nalog_reminder", s.data().get("type"));
    }

    @Test
    void disabledReminderSendsNothing() {
        insertUser(2, "Prvi", "technician");
        nalog("N-1", customer(), 2L, "IN_PROGRESS", "1 hour");
        FakeSender fake = new FakeSender();
        new NalogReminderService(jdbc, fake, false).scheduledRun();
        assertTrue(fake.sent.isEmpty());
    }

    @Test
    void forgottenMeansOpenAndUntouchedForMoreThanTwoDays() {
        insertUser(2, "Prvi", "technician");
        long c = customer();
        nalog("N-OLD", c, 2L, "IN_PROGRESS", "3 days");
        nalog("N-OLDER", c, null, "DISPATCHED", "10 days");
        nalog("N-FRESH", c, 2L, "IN_PROGRESS", "1 day");
        nalog("N-PARTS", c, 2L, "AWAITING_PARTS", "10 days");
        nalog("N-DONE", c, 2L, "COMPLETED", "10 days");
        nalog("N-DRAFT", c, null, "DRAFT", "10 days");

        StaleNalogs r = stale.list();

        assertEquals(2, r.days());
        assertEquals(2, r.total());
        assertEquals("N-OLDER", r.items().get(0).nalogNumber());        // oldest first
        assertEquals(10, r.items().get(0).idleDays());
        assertNull(r.items().get(0).technicianName());
        assertEquals("Prvi", r.items().get(1).technicianName());
    }
}
