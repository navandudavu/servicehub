package rs.elgor.nalog.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.domain.AppUser;
import rs.elgor.nalog.domain.RefreshToken;
import rs.elgor.nalog.dto.AccountDtos.RefreshResponse;
import rs.elgor.nalog.dto.AccountDtos.UserView;
import rs.elgor.nalog.repo.AppUserRepository;
import rs.elgor.nalog.repo.RefreshTokenRepository;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Keeps people logged in. A refresh token lives 30 days and is single use: every refresh returns a new login token AND a
 * new refresh token, so a phone that is used at least once a month never has to log in again.
 * A refresh token is refused if the account is gone or deactivated, or if the password was changed / reset after the token
 * was made (same "tokens_valid_after" rule as the login token), so an admin still cuts someone off at once.
 */
@Service
public class RefreshTokenService {

    static final Duration LIFETIME = Duration.ofDays(30);

    private final RefreshTokenRepository tokens;
    private final AppUserRepository users;
    private final JwtIssuer issuer;
    private final SecureRandom random = new SecureRandom();

    public RefreshTokenService(RefreshTokenRepository tokens, AppUserRepository users, JwtIssuer issuer) {
        this.tokens = tokens;
        this.users = users;
        this.issuer = issuer;
    }

    /** A new refresh token for this user; the returned text is the only time the secret exists in clear. */
    @Transactional(rollbackFor = Exception.class)
    public String issueFor(long userId) {
        return issueFor(userId, Instant.now());
    }

    String issueFor(long userId, Instant now) {
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String secret = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        RefreshToken t = new RefreshToken();
        t.setUserId(userId);
        t.setTokenHash(hash(secret));
        t.setCreatedAt(now);
        t.setExpiresAt(now.plus(LIFETIME));
        tokens.save(t);
        return secret;
    }

    /** Trades a refresh token for a new pair. Any problem is the same 401, so the caller learns nothing about why. */
    @Transactional(rollbackFor = Exception.class)
    public RefreshResponse refresh(String secret) {
        return refresh(secret, Instant.now());
    }

    RefreshResponse refresh(String secret, Instant now) {
        if (secret == null || secret.isBlank() || secret.length() > 200) {
            throw rejected();
        }
        tokens.deleteExpired(now);
        RefreshToken t = tokens.findByTokenHash(hash(secret)).orElseThrow(RefreshTokenService::rejected);
        if (t.isRevoked() || !t.getExpiresAt().isAfter(now)) {
            throw rejected();
        }
        AppUser u = users.findById(t.getUserId()).orElseThrow(RefreshTokenService::rejected);
        long made = t.getCreatedAt().getEpochSecond();
        if (!u.isActive() || (u.getTokensValidAfter() > 0 && made < u.getTokensValidAfter())) {
            throw rejected();
        }
        if (tokens.markUsed(t.getId()) != 1) {
            throw rejected();                                   // someone else used it first
        }
        return new RefreshResponse(issuer.issue(u), issueFor(u.getId(), now), UserView.from(u));
    }

    /** Logout: the token stops working. Unknown or already used tokens are ignored. */
    @Transactional(rollbackFor = Exception.class)
    public void revoke(String secret) {
        if (secret == null || secret.isBlank() || secret.length() > 200) {
            return;
        }
        tokens.findByTokenHash(hash(secret)).ifPresent(t -> tokens.markUsed(t.getId()));
    }

    private static NalogException rejected() {
        return new NalogException(HttpStatus.UNAUTHORIZED, "Your session has expired. Log in again.");
    }

    private static String hash(String secret) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
