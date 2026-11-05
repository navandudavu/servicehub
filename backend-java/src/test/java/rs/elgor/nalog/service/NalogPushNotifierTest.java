package rs.elgor.nalog.service;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NalogPushNotifierTest {

    private HttpServer server(int status, AtomicReference<String> auth, AtomicReference<String> body) throws Exception {
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        s.createContext("/api/notifications/nalog-assigned", ex -> {
            auth.set(ex.getRequestHeaders().getFirst("Authorization"));
            body.set(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            ex.sendResponseHeaders(status, -1);
            ex.close();
        });
        s.start();
        return s;
    }

    @Test
    void forwardsAdminTokenAndIdsOnly() throws Exception {
        AtomicReference<String> auth = new AtomicReference<>(), body = new AtomicReference<>();
        HttpServer s = server(202, auth, body);
        try {
            var n = new NalogPushNotifier(true, "http://127.0.0.1:" + s.getAddress().getPort() + "/");
            assertTrue(n.sendNow("tok123", 7L, 42L, "RN-2026-0001"));
            assertEquals("Bearer tok123", auth.get());
            assertTrue(body.get().contains("\"userId\":7"));
            assertTrue(body.get().contains("\"nalogId\":42"));
            assertTrue(body.get().contains("RN-2026-0001"));
            assertFalse(body.get().contains("title"));          // text is Node's business, not ours
        } finally {
            s.stop(0);
        }
    }

    @Test
    void refusedOrUnreachableNeverThrows() throws Exception {
        AtomicReference<String> auth = new AtomicReference<>(), body = new AtomicReference<>();
        HttpServer s = server(403, auth, body);
        try {
            assertFalse(new NalogPushNotifier(true, "http://127.0.0.1:" + s.getAddress().getPort())
                    .sendNow("t", 1L, 1L, "A-1"));
        } finally {
            s.stop(0);
        }
        assertFalse(new NalogPushNotifier(true, "http://127.0.0.1:1").sendNow("t", 1L, 1L, "A-1"));
    }

    @Test
    void disabledDoesNothing() {
        new NalogPushNotifier(false, "http://127.0.0.1:1").notifyAssigned(1L, 1L, "A-1");
    }
}
