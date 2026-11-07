package rs.elgor.nalog.service;

import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LoginThrottleTest {

    private final AtomicLong now = new AtomicLong(1_000_000);
    private final LoginThrottle t = new LoginThrottle(now::get);

    @Test
    void blocksAfterEightFailuresForThatEmailOnly() {
        for (int i = 0; i < LoginThrottle.MAX_FAILS; i++) {
            assertEquals(0, t.retryAfterSeconds("1.1.1.1", "a@x"));
            t.failure("1.1.1.1", "a@x");
        }
        assertTrue(t.retryAfterSeconds("1.1.1.1", "a@x") > 0);
        assertEquals(0, t.retryAfterSeconds("1.1.1.1", "b@x"));         // another email from the same IP is still allowed
        assertEquals(0, t.retryAfterSeconds("2.2.2.2", "a@x"));         // another IP is still allowed
    }

    @Test
    void windowExpires() {
        for (int i = 0; i < LoginThrottle.MAX_FAILS; i++) t.failure("1.1.1.1", "a@x");
        assertTrue(t.retryAfterSeconds("1.1.1.1", "a@x") > 0);
        now.addAndGet(LoginThrottle.WINDOW_MS + 1);
        assertEquals(0, t.retryAfterSeconds("1.1.1.1", "a@x"));
    }

    @Test
    void successClearsOnlyThePair() {
        for (int i = 0; i < 5; i++) t.failure("1.1.1.1", "a@x");
        t.success("1.1.1.1", "a@x");
        for (int i = 0; i < 7; i++) t.failure("1.1.1.1", "a@x");
        assertEquals(0, t.retryAfterSeconds("1.1.1.1", "a@x"));         // 7 since the reset: not blocked yet
    }

    @Test
    void passwordSprayingFromOneIpHitsTheWiderCap() {
        for (int i = 0; i < LoginThrottle.IP_MAX_FAILS; i++) t.failure("9.9.9.9", "user" + i + "@x");
        assertTrue(t.retryAfterSeconds("9.9.9.9", "someone-new@x") > 0);
        assertEquals(0, t.retryAfterSeconds("8.8.8.8", "someone-new@x"));
    }

    @Test
    void emailIsCaseInsensitive() {
        for (int i = 0; i < LoginThrottle.MAX_FAILS; i++) t.failure("1.1.1.1", "A@X");
        assertTrue(t.retryAfterSeconds("1.1.1.1", "a@x") > 0);
    }
}
