package rs.elgor.nalog.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.function.LongSupplier;

/**
 * Login throttle, in memory (resets on restart, fine for one process):
 *  - 8 failed attempts per IP + email within 15 minutes, then blocked until the window ends;
 *  - a second, wider cap of 40 failures per IP, so one address trying many emails (password spraying) is stopped
 *    even though no single IP+email pair reaches 8. A successful login clears only the IP+email counter.
 */
@Component
public class LoginThrottle {

    static final long WINDOW_MS = 15 * 60 * 1000L;
    static final int MAX_FAILS = 8;
    static final int IP_MAX_FAILS = 40;

    private record Counter(int count, long first) {}

    private final LongSupplier clock;
    private final Map<String, Counter> pairFails = new HashMap<>();
    private final Map<String, Counter> ipFails = new HashMap<>();

    @Autowired
    public LoginThrottle() {
        this(System::currentTimeMillis);
    }

    LoginThrottle(LongSupplier clock) {
        this.clock = clock;
    }

    /** 0 = allowed, otherwise the number of seconds until the block ends. */
    public synchronized long retryAfterSeconds(String ip, String email) {
        purgeIfLarge();
        Counter pair = live(pairFails, key(ip, email));
        Counter byIp = live(ipFails, ip);
        Counter blocker = pair != null && pair.count() >= MAX_FAILS ? pair
                : (byIp != null && byIp.count() >= IP_MAX_FAILS ? byIp : null);
        if (blocker == null) {
            return 0;
        }
        long left = WINDOW_MS - (clock.getAsLong() - blocker.first());
        return Math.max(1, (left + 999) / 1000);
    }

    public synchronized void failure(String ip, String email) {
        bump(pairFails, key(ip, email));
        bump(ipFails, ip);
    }

    public synchronized void success(String ip, String email) {
        pairFails.remove(key(ip, email));
    }

    private static String key(String ip, String email) {
        return ip + "|" + (email == null ? "" : email.trim().toLowerCase());
    }

    private Counter live(Map<String, Counter> map, String k) {
        Counter c = map.get(k);
        if (c != null && clock.getAsLong() - c.first() > WINDOW_MS) {
            map.remove(k);
            return null;
        }
        return c;
    }

    private void bump(Map<String, Counter> map, String k) {
        Counter c = live(map, k);
        map.put(k, c == null ? new Counter(1, clock.getAsLong()) : new Counter(c.count() + 1, c.first()));
    }

    private void purgeIfLarge() {
        if (pairFails.size() + ipFails.size() > 5000) {
            long now = clock.getAsLong();
            pairFails.values().removeIf(c -> now - c.first() > WINDOW_MS);
            ipFails.values().removeIf(c -> now - c.first() > WINDOW_MS);
        }
    }
}
