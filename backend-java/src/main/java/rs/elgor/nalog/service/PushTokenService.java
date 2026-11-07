package rs.elgor.nalog.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;

/** Phone push (FCM) tokens: the app registers its token after login, the push sender reads and prunes them. */
@Service
public class PushTokenService {

    private final JdbcTemplate jdbc;

    public PushTokenService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(rollbackFor = Exception.class)
    public void register(long userId, String token, String platform) {
        if (token == null || token.isBlank() || token.length() > 512) {
            throw NalogException.invalid("Token is required");
        }
        String p = platform == null || platform.isBlank() ? "android" : platform.trim().toLowerCase();
        if (p.length() > 20) {
            throw NalogException.invalid("Invalid platform");
        }
        jdbc.update("INSERT INTO user_tokens (user_id, token, platform) VALUES (?, ?, ?) "
                + "ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, created_at = now()",
                userId, token.trim(), p);
    }

    @Transactional(readOnly = true)
    public List<String> tokensFor(long userId) {
        return jdbc.queryForList("SELECT token FROM user_tokens WHERE user_id = ?", String.class, userId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void remove(Collection<String> tokens) {
        for (String t : tokens) {
            jdbc.update("DELETE FROM user_tokens WHERE token = ?", t);
        }
    }
}
