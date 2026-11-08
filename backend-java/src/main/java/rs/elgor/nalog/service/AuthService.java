package rs.elgor.nalog.service;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import rs.elgor.nalog.domain.AppUser;
import rs.elgor.nalog.dto.AccountDtos.LoginResponse;
import rs.elgor.nalog.dto.AccountDtos.UserView;
import rs.elgor.nalog.repo.AppUserRepository;

/** Login. Passwords are BCrypt; hashes made by the old Node backend ($2a/$2b) verify unchanged. */
@Service
public class AuthService {

    private final AppUserRepository users;
    private final JwtIssuer issuer;
    private final LoginThrottle throttle;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(10);
    /** Checked when the email is unknown, so "no such user" takes as long as "wrong password". */
    private final String dummyHash = encoder.encode("not-a-real-password");

    public AuthService(AppUserRepository users, JwtIssuer issuer, LoginThrottle throttle) {
        this.users = users;
        this.issuer = issuer;
        this.throttle = throttle;
    }

    public LoginResponse login(String email, String password, String ip) {
        if (email == null || email.isBlank() || password == null || password.isEmpty()) {
            throw NalogException.invalid("Email and password required");
        }
        String trimmed = email.trim();
        long wait = throttle.retryAfterSeconds(ip, trimmed);
        if (wait > 0) {
            throw new LoginBlockedException(wait);
        }

        AppUser u = users.findByEmailIgnoreCase(trimmed).filter(AppUser::isActive).orElse(null);
        boolean ok;
        if (u == null || u.getPasswordHash() == null) {
            encoder.matches(password, dummyHash);
            ok = false;
        } else {
            ok = encoder.matches(password, u.getPasswordHash());
        }
        if (!ok) {
            throttle.failure(ip, trimmed);
            throw new NalogException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        throttle.success(ip, trimmed);
        return new LoginResponse(issuer.issue(u), UserView.from(u));
    }

    public UserView me(long userId) {
        return users.findById(userId).map(UserView::from)
                .orElseThrow(() -> NalogException.notFound("User not found"));
    }
}
