package rs.elgor.nalog.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.dto.UserSyncItem;

import java.util.List;

/**
 * Keeps app_user in step with the Node-owned ServiceHub accounts.
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

    /**
     * Reconcile the Java directory against a complete snapshot from Node's /api/users.
     * Users missing from the snapshot are deactivated, not deleted, so existing nalog
     * assignments and audit references remain intact.
     */
    @Transactional
    public int sync(List<UserSyncItem> items) {
        if (items == null || items.isEmpty()) {
            throw NalogException.invalid("The user sync snapshot is empty; refusing to deactivate the directory");
        }

        // The Node user table is authoritative. Anything not present in this full snapshot
        // is no longer a valid account and must not remain assignable in the nalog service.
        em.createNativeQuery("UPDATE app_user SET active = FALSE").executeUpdate();

        int synced = 0;
        for (UserSyncItem u : items) {
            String role = u.role().toLowerCase();
            if (!role.equals("admin") && !role.equals("technician")) {
                continue; // app_user has a CHECK constraint on role
            }
            em.createNativeQuery(
                    "INSERT INTO app_user (id, name, role, active, last_seen_at) VALUES (:id, :name, :role, :active, now()) "
                  + "ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, "
                  + "active = EXCLUDED.active, last_seen_at = now()")
              .setParameter("id", u.id())
              .setParameter("name", u.name())
              .setParameter("role", role)
              .setParameter("active", u.active())
              .executeUpdate();
            synced++;
        }
        return synced;
    }
}
