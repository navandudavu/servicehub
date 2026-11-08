package rs.elgor.nalog.service;

import java.util.Map;

/** Sends a push to every phone a user has registered. Implementations never throw: a failed push is only logged. */
public interface PushSender {
    void sendToUser(long userId, String title, String body, Map<String, String> data);
}
