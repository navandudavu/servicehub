package rs.elgor.nalog.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * Closes the "valid for 12 h after deactivation" gap. A JWT proves who signed it, not that the
 * account still exists. Node owns the accounts and already re-reads the user row on every
 * request, so this asks Node (GET /api/auth/me with the caller's own token) and caches the
 * answer for a short time.
 *
 *  VALID        Node accepted the token and the role still matches the one in the token.
 *  REVOKED      Node answered 401/403/404, or the role changed (demotion/promotion): log in again.
 *  UNAVAILABLE  Node did not answer. A previously VALID answer is still honoured for
 *               {@code graceMs}; with no such answer we fail closed.
 */
public class NodeSessionValidator {

    public enum Result { VALID, REVOKED, UNAVAILABLE }

    private record Entry(Result result, long checkedAt, long lastGoodAt) {}

    private static final Logger log = LoggerFactory.getLogger(NodeSessionValidator.class);
    private static final int MAX_ENTRIES = 5_000;

    private final String meUrl;
    private final long ttlMs;
    private final long graceMs;
    private final LongSupplier clock;
    private final HttpClient http;
    private final ObjectMapper mapper = new ObjectMapper();
    private final Map<String, Entry> cache = new ConcurrentHashMap<>();

    public NodeSessionValidator(String nodeBaseUrl, long ttlMs, long graceMs, LongSupplier clock) {
        String base = nodeBaseUrl.endsWith("/") ? nodeBaseUrl.substring(0, nodeBaseUrl.length() - 1) : nodeBaseUrl;
        this.meUrl = base + "/api/auth/me";
        this.ttlMs = ttlMs;
        this.graceMs = graceMs;
        this.clock = clock;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    }

    public Result check(String token, String roleInToken) {
        String key = sha256(token);
        long now = clock.getAsLong();
        Entry cached = cache.get(key);
        if (cached != null && cached.result() != Result.UNAVAILABLE && now - cached.checkedAt() < ttlMs) {
            return cached.result();
        }

        Result fresh = askNode(token, roleInToken);
        if (fresh == Result.UNAVAILABLE) {
            // Node is down or slow: keep honouring a recent good answer, otherwise fail closed.
            if (cached != null && cached.lastGoodAt() > 0 && now - cached.lastGoodAt() < graceMs) {
                return Result.VALID;
            }
            return Result.UNAVAILABLE;
        }
        long lastGood = fresh == Result.VALID ? now : 0;
        if (cache.size() >= MAX_ENTRIES) {
            cache.entrySet().removeIf(e -> now - e.getValue().checkedAt() > Math.max(ttlMs, graceMs));
            if (cache.size() >= MAX_ENTRIES) {
                cache.clear();                       // pathological; the next requests just re-ask Node
            }
        }
        cache.put(key, new Entry(fresh, now, lastGood));
        return fresh;
    }

    private Result askNode(String token, String roleInToken) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(meUrl))
                    .timeout(Duration.ofSeconds(3))
                    .header("Authorization", "Bearer " + token)
                    .header("Accept", "application/json")
                    .GET().build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            int s = res.statusCode();
            if (s == 401 || s == 403 || s == 404) {
                return Result.REVOKED;
            }
            if (s != 200) {
                log.warn("Node session check answered HTTP {}", s);
                return Result.UNAVAILABLE;
            }
            JsonNode body = mapper.readTree(res.body());
            String nodeRole = body.path("role").asText("");
            if (roleInToken == null || !nodeRole.equalsIgnoreCase(roleInToken)) {
                return Result.REVOKED;               // role changed since the token was issued
            }
            return Result.VALID;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Result.UNAVAILABLE;
        } catch (Exception e) {
            log.warn("Node session check failed: {}", e.toString());
            return Result.UNAVAILABLE;
        }
    }

    private static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
