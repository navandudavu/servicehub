package rs.elgor.nalog.config;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static rs.elgor.nalog.config.NodeSessionValidator.Result.*;

/** No Spring, no Docker: a tiny fake "Node" on a random port. */
class NodeSessionValidatorTest {

    HttpServer node;
    int port;
    volatile int status = 200;
    volatile String role = "technician";
    final AtomicInteger calls = new AtomicInteger();
    final AtomicLong now = new AtomicLong(1_000_000);

    @BeforeEach
    void start() throws Exception {
        node = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        node.createContext("/api/auth/me", ex -> {
            calls.incrementAndGet();
            byte[] body = ("{\"id\":2,\"role\":\"" + role + "\"}").getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(status, status == 200 ? body.length : -1);
            if (status == 200) ex.getResponseBody().write(body);
            ex.close();
        });
        node.start();
        port = node.getAddress().getPort();
    }

    @AfterEach
    void stop() { stopNode(); }

    private void stopNode() {
        if (node != null) {
            node.stop(0);
            node = null;
        }
    }

    private NodeSessionValidator validator() {
        return new NodeSessionValidator("http://127.0.0.1:" + port, 30_000, 600_000, now::get);
    }

    @Test
    void acceptedAccountIsValidAndAnswerIsCached() {
        var v = validator();
        assertEquals(VALID, v.check("tok", "technician"));
        assertEquals(VALID, v.check("tok", "technician"));
        assertEquals(1, calls.get());                       // second call served from cache
    }

    @Test
    void deactivatedAccountIsRevokedOnceTheCacheExpires() {
        var v = validator();
        assertEquals(VALID, v.check("tok", "technician"));
        status = 401;
        assertEquals(VALID, v.check("tok", "technician"));  // still inside the 30 s window
        now.addAndGet(31_000);
        assertEquals(REVOKED, v.check("tok", "technician"));
    }

    @Test
    void changedRoleIsRevoked() {
        role = "technician";
        assertEquals(REVOKED, validator().check("tok", "admin"));   // token says admin, Node says technician
    }

    @Test
    void nodeDownWithNoHistoryFailsClosed() {
        stopNode();
        assertEquals(UNAVAILABLE, validator().check("tok", "technician"));
    }

    @Test
    void nodeDownAfterAGoodAnswerIsTolerantOnlyWithinTheGracePeriod() {
        var v = validator();
        assertEquals(VALID, v.check("tok", "technician"));
        stopNode();
        now.addAndGet(60_000);
        assertEquals(VALID, v.check("tok", "technician"));           // within 10 min grace
        now.addAndGet(600_000);
        assertEquals(UNAVAILABLE, v.check("tok", "technician"));     // grace used up
    }

    @Test
    void serverErrorIsNotTreatedAsRevocation() {
        status = 500;
        assertEquals(UNAVAILABLE, validator().check("tok", "technician"));
    }
}
