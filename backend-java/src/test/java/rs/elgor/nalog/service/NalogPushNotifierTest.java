package rs.elgor.nalog.service;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NalogPushNotifierTest {

    record Sent(long userId, String title, String body, Map<String, String> data) {}

    static class FakeSender implements PushSender {
        final List<Sent> sent = new ArrayList<>();
        boolean explode;

        @Override
        public void sendToUser(long userId, String title, String body, Map<String, String> data) {
            if (explode) throw new IllegalStateException("fcm down");
            sent.add(new Sent(userId, title, body, data));
        }
    }

    @Test
    void sendsFixedTextAndTheNalogId() {
        FakeSender s = new FakeSender();
        new NalogPushNotifier(true, s).sendNow(7L, 42L, "N-2026-000001");
        assertEquals(1, s.sent.size());
        Sent m = s.sent.get(0);
        assertEquals(7L, m.userId());
        assertEquals("Novi radni nalog", m.title());
        assertEquals("Dodeljen vam je nalog N-2026-000001", m.body());
        assertEquals("42", m.data().get("nalogId"));
        assertEquals("nalog_assigned", m.data().get("type"));
    }

    @Test
    void aFailingSenderNeverThrows() {
        FakeSender s = new FakeSender();
        s.explode = true;
        new NalogPushNotifier(true, s).sendNow(1L, 1L, "A-1");           // must not throw
        assertTrue(s.sent.isEmpty());
    }

    @Test
    void disabledSendsNothing() {
        FakeSender s = new FakeSender();
        new NalogPushNotifier(false, s).notifyAssigned(1L, 1L, "A-1");
        assertTrue(s.sent.isEmpty());
    }
}
