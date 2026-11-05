package rs.elgor.nalog.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * "A nalog was assigned to you" push. Node owns the device tokens and Firebase, so this only asks
 * Node (POST /api/notifications/nalog-assigned) using the acting admin's own bearer token; Node
 * accepts that for admins only and builds the text itself.
 *
 * Best effort by design: it runs AFTER the transaction commits (a rolled-back nalog never notifies),
 * on its own thread, with short timeouts, and a failure is only logged. It can never fail or slow
 * down the assignment that triggered it.
 */
@Component
public class NalogPushNotifier {

    private static final Logger log = LoggerFactory.getLogger(NalogPushNotifier.class);

    private final boolean enabled;
    private final String url;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    private final ObjectMapper mapper = new ObjectMapper();
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "nalog-push");
        t.setDaemon(true);
        return t;
    });

    public NalogPushNotifier(@Value("${nalog.push.enabled:true}") boolean enabled,
                             @Value("${nalog.auth.node-url:http://localhost:4000}") String nodeUrl) {
        this.enabled = enabled;
        String base = nodeUrl.endsWith("/") ? nodeUrl.substring(0, nodeUrl.length() - 1) : nodeUrl;
        this.url = base + "/api/notifications/nalog-assigned";
    }

    /** Call inside the assigning transaction; the push goes out only if (and after) it commits. */
    public void notifyAssigned(long technicianId, long nalogId, String nalogNumber) {
        if (!enabled) {
            return;
        }
        String token = currentBearerToken();
        if (token == null) {
            return;                                           // not inside an HTTP request: nothing to forward
        }
        Runnable send = () -> executor.execute(() -> sendNow(token, technicianId, nalogId, nalogNumber));
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send.run();
                }
            });
        } else {
            send.run();
        }
    }

    /** Package-private so the test can call it directly, without threads or a transaction. */
    boolean sendNow(String bearerToken, long technicianId, long nalogId, String nalogNumber) {
        try {
            String json = mapper.writeValueAsString(Map.of(
                    "userId", technicianId, "nalogId", nalogId, "nalogNumber", nalogNumber));
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(3))
                    .header("Authorization", "Bearer " + bearerToken)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
                    .build();
            HttpResponse<Void> res = http.send(req, HttpResponse.BodyHandlers.discarding());
            if (res.statusCode() / 100 != 2) {
                log.warn("Push for nalog {} was refused by Node: HTTP {}", nalogNumber, res.statusCode());
                return false;
            }
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } catch (Exception e) {
            log.warn("Push for nalog {} could not be sent: {}", nalogNumber, e.toString());
            return false;
        }
    }

    private static String currentBearerToken() {
        if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs)) {
            return null;
        }
        String h = attrs.getRequest().getHeader("Authorization");
        return h != null && h.regionMatches(true, 0, "Bearer ", 0, 7) ? h.substring(7).trim() : null;
    }
}
