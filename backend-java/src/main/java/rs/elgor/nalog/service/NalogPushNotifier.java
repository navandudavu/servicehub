package rs.elgor.nalog.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * "A nalog was assigned to you" push.
 *
 * Best effort by design: it goes out only AFTER the assigning transaction commits (a rolled-back nalog never
 * notifies), on its own thread, and a failure is only logged. It can never fail or slow down the assignment.
 * The text is fixed here, so nothing a user typed ends up in a notification.
 */
@Component
public class NalogPushNotifier {

    private static final Logger log = LoggerFactory.getLogger(NalogPushNotifier.class);

    private final boolean enabled;
    private final PushSender sender;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "nalog-push");
        t.setDaemon(true);
        return t;
    });

    public NalogPushNotifier(@Value("${nalog.push.enabled:true}") boolean enabled, PushSender sender) {
        this.enabled = enabled;
        this.sender = sender;
    }

    /** Call inside the assigning transaction; the push goes out only if (and after) it commits. */
    public void notifyAssigned(long technicianId, long nalogId, String nalogNumber) {
        if (!enabled) {
            return;
        }
        Runnable send = () -> executor.execute(() -> sendNow(technicianId, nalogId, nalogNumber));
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

    /** Package-private so the test can call it without threads or a transaction. */
    void sendNow(long technicianId, long nalogId, String nalogNumber) {
        try {
            sender.sendToUser(technicianId, "Novi radni nalog", "Dodeljen vam je nalog " + nalogNumber,
                    Map.of("nalogId", String.valueOf(nalogId), "type", "nalog_assigned"));
        } catch (Exception e) {
            log.warn("Push for nalog {} could not be sent: {}", nalogNumber, e.toString());
        }
    }
}
