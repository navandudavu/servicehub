package rs.elgor.nalog.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.domain.AuthUser;

/**
 * Keeps app_user in step with the JWTs we see. Best-effort by design: if this write
 * fails, the request it belongs to must still succeed.
 */
@Service
public class UserDirectoryService {

    private static final Logger log = LoggerFactory.getLogger(UserDirectoryService.class);

    @PersistenceContext
    private EntityManager em;

    /** Decode the caller from the JWT and refresh their directory row (at most every 5 minutes). */
    public AuthUser resolve(Jwt jwt) {
        Object id = jwt.getClaim("id");
        if (!(id instanceof Number)) {
            throw new IllegalStateException("JWT has no numeric 'id' claim");
        }
        String name = jwt.getClaimAsString("name");
        AuthUser user = new AuthUser(((Number) id).longValue(), name == null ? "unknown" : name, jwt.getClaimAsString("role"));
        try {
            touch(user);
        } catch (RuntimeException e) {
            log.warn("Could not refresh user directory for user {}: {}", user.id(), e.getMessage());
        }
        return user;
    }

    @Transactional
    public void touch(AuthUser u) {
        if (u.role() == null || !(u.isAdmin() || "technician".equalsIgnoreCase(u.role()))) {
            return;                                   // unknown role: never write it into a CHECK-constrained column
        }
        em.createNativeQuery(
                "INSERT INTO app_user (id, name, role, last_seen_at) VALUES (:id, :name, :role, now()) "
              + "ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, last_seen_at = now() "
              + "WHERE app_user.last_seen_at < now() - interval '5 minutes' OR app_user.name <> EXCLUDED.name OR app_user.role <> EXCLUDED.role")
          .setParameter("id", u.id())
          .setParameter("name", u.name())
          .setParameter("role", u.role().toLowerCase())
          .executeUpdate();
    }

    /** Admin-triggered refresh of the whole directory from the Node team list (also picks up deactivations). */
    @Transactional
    public int sync(java.util.List<rs.elgor.nalog.dto.UserSyncItem> items) {
        int n = 0;
        for (rs.elgor.nalog.dto.UserSyncItem u : items) {
            String role = u.role().toLowerCase();
            if (!role.equals("admin") && !role.equals("technician")) continue;   // CHECK-constrained column
            em.createNativeQuery(
                    "INSERT INTO app_user (id, name, role, active, last_seen_at) VALUES (:id, :name, :role, :active, now()) "
                  + "ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, active = EXCLUDED.active")
              .setParameter("id", u.id())
              .setParameter("name", u.name())
              .setParameter("role", role)
              .setParameter("active", u.active())
              .executeUpdate();
            n++;
        }
        return n;
    }
}
