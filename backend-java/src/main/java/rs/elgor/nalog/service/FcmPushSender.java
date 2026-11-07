package rs.elgor.nalog.service;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.AndroidConfig;
import com.google.firebase.messaging.BatchResponse;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.MessagingErrorCode;
import com.google.firebase.messaging.MulticastMessage;
import com.google.firebase.messaging.SendResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Firebase Cloud Messaging. Needs the service-account JSON (Firebase console > Project settings > Service accounts)
 * at nalog.push.credentials (in Docker: ./secrets/firebase-service-account.json). Without that file push is simply off
 * and everything else works.
 *
 * Data-only messages (title and body travel inside "data"): the Android app then always builds the notification
 * itself, with the right deep link, whether it is in the foreground or not.
 */
@Component
public class FcmPushSender implements PushSender {

    private static final Logger log = LoggerFactory.getLogger(FcmPushSender.class);

    private final PushTokenService tokens;
    private final boolean ready;

    public FcmPushSender(PushTokenService tokens,
                         @Value("${nalog.push.enabled:true}") boolean enabled,
                         @Value("${nalog.push.credentials:/secrets/firebase-service-account.json}") String credentialsPath) {
        this.tokens = tokens;
        this.ready = enabled && init(credentialsPath);
    }

    private static boolean init(String credentialsPath) {
        Path file = Path.of(credentialsPath);
        if (!Files.exists(file)) {
            log.warn("Firebase key not found at {} - push notifications are OFF.", file);
            return false;
        }
        if (!Files.isReadable(file)) {
            log.warn("Firebase key at {} exists but is not readable by this service (see DEPLOY.md, section Push) - push is OFF.", file);
            return false;
        }
        try (InputStream in = Files.newInputStream(file)) {
            if (FirebaseApp.getApps().isEmpty()) {
                FirebaseApp.initializeApp(FirebaseOptions.builder().setCredentials(GoogleCredentials.fromStream(in)).build());
            }
            log.info("Push notifications are ON (Firebase initialised).");
            return true;
        } catch (Exception e) {
            log.error("Could not initialise Firebase from {} - push is OFF: {}", file, e.toString());
            return false;
        }
    }

    @Override
    public void sendToUser(long userId, String title, String body, Map<String, String> data) {
        if (!ready) {
            return;
        }
        try {
            List<String> list = tokens.tokensFor(userId);
            if (list.isEmpty()) {
                return;
            }
            Map<String, String> payload = new java.util.HashMap<>(data);
            payload.put("title", title);
            payload.put("body", body);
            MulticastMessage message = MulticastMessage.builder()
                    .addAllTokens(list)
                    .putAllData(payload)
                    .setAndroidConfig(AndroidConfig.builder().setPriority(AndroidConfig.Priority.HIGH).build())
                    .build();
            BatchResponse response = FirebaseMessaging.getInstance().sendEachForMulticast(message);
            log.info("Push to user {}: {} sent, {} failed", userId, response.getSuccessCount(), response.getFailureCount());

            List<String> dead = new ArrayList<>();
            List<SendResponse> results = response.getResponses();
            for (int i = 0; i < results.size(); i++) {
                SendResponse r = results.get(i);
                if (!r.isSuccessful() && r.getException() != null) {
                    MessagingErrorCode code = r.getException().getMessagingErrorCode();
                    if (code == MessagingErrorCode.UNREGISTERED || code == MessagingErrorCode.INVALID_ARGUMENT) {
                        dead.add(list.get(i));
                    }
                }
            }
            if (!dead.isEmpty()) {
                tokens.remove(dead);
                log.info("Removed {} dead push token(s) of user {}", dead.size(), userId);
            }
        } catch (Exception e) {
            log.warn("Push to user {} failed: {}", userId, e.toString());
        }
    }
}
