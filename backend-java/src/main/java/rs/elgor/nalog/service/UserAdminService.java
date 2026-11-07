package rs.elgor.nalog.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.domain.AppUser;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.dto.AccountDtos.*;
import rs.elgor.nalog.repo.AppUserRepository;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Account management: create, edit, deactivate, reset password, delete. Admin-only operations are guarded in
 * the controller (@PreAuthorize) and the rules that protect the system (never lose the last admin) live here.
 * Every change that must log somebody out sets tokens_valid_after; the session filter then refuses their old tokens.
 */
@Service
public class UserAdminService {

    private static final Logger log = LoggerFactory.getLogger(UserAdminService.class);

    public static final int MIN_PASSWORD = 8;
    static final int MAX_PASSWORD_BYTES = 72;                  // BCrypt ignores (or rejects) anything longer
    private static final Set<String> ROLES = Set.of("admin", "technician");
    private static final String PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private final AppUserRepository users;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(10);
    private final SecureRandom random = new SecureRandom();
    private final JwtIssuer issuer;

    @PersistenceContext
    private EntityManager em;

    public UserAdminService(AppUserRepository users, JwtIssuer issuer) {
        this.users = users;
        this.issuer = issuer;
    }

    @Transactional(readOnly = true)
    public List<UserView> list() {
        return users.findAllByOrderByNameAsc().stream().map(UserView::from).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public UserView create(CreateUserRequest r) {
        String name = requireName(r.name());
        String email = requireEmail(r.email());
        String role = requireRole(r.role());
        checkPassword(r.password());
        if (users.existsByEmailIgnoreCase(email)) {
            throw NalogException.conflict("Email already in use");
        }
        AppUser u = new AppUser();
        u.setId(nextId());
        u.setName(name);
        u.setEmail(email);
        u.setRole(role);
        u.setPhone(blankToNull(r.phone(), 40));
        u.setPasswordHash(encoder.encode(r.password()));
        u.setActive(true);
        AppUser saved = users.saveAndFlush(u);
        log.info("User {} ({}) created", saved.getId(), role);
        return UserView.from(saved);
    }

    /** Admin: anyone. Anybody else: only themselves, and they cannot change their own role. */
    @Transactional(rollbackFor = Exception.class)
    public UserView update(long id, UpdateUserRequest r, AuthUser actor) {
        if (!actor.isAdmin() && actor.id() != id) {
            throw NalogException.forbidden("Permission denied");
        }
        AppUser u = load(id);
        if (r.name() != null) {
            u.setName(requireName(r.name()));
        }
        if (r.email() != null) {
            String email = requireEmail(r.email());
            if (!email.equalsIgnoreCase(u.getEmail()) && users.existsByEmailIgnoreCaseAndIdNot(email, id)) {
                throw NalogException.conflict("Email already in use");
            }
            u.setEmail(email);
        }
        if (r.phone() != null) {
            u.setPhone(blankToNull(r.phone(), 40));
        }
        if (r.role() != null && actor.isAdmin() && !r.role().equalsIgnoreCase(u.getRole())) {
            String role = requireRole(r.role());
            if ("admin".equals(u.getRole()) && u.isActive() && users.countByRoleAndActiveTrue("admin") <= 1) {
                throw NalogException.conflict("Cannot change the role of the last active admin.");
            }
            u.setRole(role);
        }
        return UserView.from(users.saveAndFlush(u));
    }

    @Transactional(rollbackFor = Exception.class)
    public void setActive(long id, Boolean active) {
        if (active == null) {
            throw NalogException.invalid("active is required");
        }
        AppUser u = load(id);
        if (!active && u.isActive() && "admin".equals(u.getRole()) && users.countByRoleAndActiveTrue("admin") <= 1) {
            throw NalogException.conflict("Cannot deactivate the last active admin.");
        }
        u.setActive(active);
        if (!active) {
            revoke(u);                                // re-activating later must not bring old tokens back to life
        }
        users.saveAndFlush(u);
    }

    /** The "forgot password" fix for a firm with no mail server: an admin sets a temporary one. */
    @Transactional(rollbackFor = Exception.class)
    public void resetPassword(long id, String newPassword) {
        checkPassword(newPassword);
        AppUser u = load(id);
        u.setPasswordHash(encoder.encode(newPassword));
        revoke(u);                                    // whoever held the old password is logged out everywhere
        users.saveAndFlush(u);
    }

    /** Returns a fresh token: every other session is logged out, this one stays logged in. */
    @Transactional(rollbackFor = Exception.class)
    public String changeMyPassword(long userId, String current, String next) {
        if (current == null || current.isEmpty() || next == null || next.isEmpty()) {
            throw NalogException.invalid("current_password and new_password are required");
        }
        checkPassword(next);
        AppUser u = load(userId);
        if (u.getPasswordHash() == null || !encoder.matches(current, u.getPasswordHash())) {
            throw new NalogException(org.springframework.http.HttpStatus.UNAUTHORIZED, "Current password is incorrect");
        }
        u.setPasswordHash(encoder.encode(next));
        revoke(u);
        users.saveAndFlush(u);
        return issuer.issue(u);
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(long id, AuthUser actor) {
        AppUser u = load(id);
        if (id == actor.id()) {
            throw NalogException.invalid("You can't delete your own account.");
        }
        if ("admin".equals(u.getRole()) && u.isActive() && users.countByRoleAndActiveTrue("admin") <= 1) {
            throw NalogException.conflict("Cannot delete the last active admin.");
        }
        users.delete(u);                              // nalog.assigned_to_id is set to NULL by the database, names stay
        users.flush();
        log.info("User {} deleted by {}", id, actor.id());
    }

    /**
     * First start of a new install: nobody can log in yet, so create one admin with a random password and return it
     * (the caller logs it once). Does nothing as soon as any account has a password.
     */
    @Transactional(rollbackFor = Exception.class)
    public Optional<String> bootstrapAdminIfNone(String email) {
        if (users.existsByPasswordHashIsNotNull()) {
            return Optional.empty();
        }
        String password = randomPassword(14);
        AppUser u = users.findByEmailIgnoreCase(email).orElse(null);
        if (u == null) {
            u = new AppUser();
            u.setId(nextId());
            u.setName("Administrator");
            u.setEmail(email);
            u.setRole("admin");
        }
        u.setActive(true);
        u.setPasswordHash(encoder.encode(password));
        users.saveAndFlush(u);
        return Optional.of(password);
    }

    // ---- helpers -----------------------------------------------------------

    private AppUser load(long id) {
        return users.findById(id).orElseThrow(() -> NalogException.notFound("User not found"));
    }

    private static void revoke(AppUser u) {
        u.setTokensValidAfter(Instant.now().getEpochSecond());
    }

    private long nextId() {
        return ((Number) em.createNativeQuery("select nextval('app_user_id_seq')").getSingleResult()).longValue();
    }

    private String randomPassword(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(PASSWORD_ALPHABET.charAt(random.nextInt(PASSWORD_ALPHABET.length())));
        }
        return sb.toString();
    }

    static void checkPassword(String p) {
        if (p == null || p.length() < MIN_PASSWORD) {
            throw NalogException.invalid("Password must be at least " + MIN_PASSWORD + " characters");
        }
        if (p.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw NalogException.invalid("Password is too long (at most " + MAX_PASSWORD_BYTES + " bytes)");
        }
    }

    private static String requireName(String name) {
        if (name == null || name.isBlank()) {
            throw NalogException.invalid("Name cannot be empty");
        }
        String t = name.trim();
        if (t.length() > 150) {
            throw NalogException.invalid("Name is too long");
        }
        return t;
    }

    private static String requireEmail(String email) {
        if (email == null || email.isBlank()) {
            throw NalogException.invalid("Email cannot be empty");
        }
        String t = email.trim();
        if (t.length() > 150 || !t.contains("@") || t.contains(" ")) {
            throw NalogException.invalid("Email is not valid");
        }
        return t;
    }

    private static String requireRole(String role) {
        if (role == null || !ROLES.contains(role.trim().toLowerCase())) {
            throw NalogException.invalid("role must be admin or technician");
        }
        return role.trim().toLowerCase();
    }

    private static String blankToNull(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }
}
