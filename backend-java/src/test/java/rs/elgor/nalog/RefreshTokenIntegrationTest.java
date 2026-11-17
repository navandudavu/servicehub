package rs.elgor.nalog;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import rs.elgor.nalog.dto.AccountDtos.*;
import rs.elgor.nalog.service.AuthService;
import rs.elgor.nalog.service.NalogException;
import rs.elgor.nalog.service.RefreshTokenService;
import rs.elgor.nalog.service.UserAdminService;

import static org.junit.jupiter.api.Assertions.*;

/** Refresh tokens against the real database: stay logged in, single use, cut off by password change / deactivation. */
class RefreshTokenIntegrationTest extends AbstractIntegrationTest {

    @Autowired UserAdminService users;
    @Autowired AuthService auth;
    @Autowired RefreshTokenService refreshTokens;
    @Autowired JwtDecoder decoder;

    private UserView tech(String email) {
        return users.create(new CreateUserRequest("Tech " + email, email, "password123", "technician", null));
    }

    private int status(Runnable r) {
        return assertThrows(NalogException.class, r::run).getStatus().value();
    }

    @Test
    void loginReturnsARefreshTokenAndOnlyItsHashIsStored() {
        tech("t@x");
        LoginResponse r = auth.login("t@x", "password123", "1.1.1.1");
        assertNotNull(r.refreshToken());
        assertTrue(r.refreshToken().length() >= 40);
        assertEquals(1, count("refresh_token"));
        String stored = jdbc.queryForObject("SELECT token_hash FROM refresh_token", String.class);
        assertNotEquals(r.refreshToken(), stored);
        assertEquals(64, stored.length());
    }

    @Test
    void refreshGivesANewPairAndTheOldRefreshTokenIsDead() {
        UserView t = tech("t@x");
        LoginResponse login = auth.login("t@x", "password123", "1.1.1.1");

        RefreshResponse next = refreshTokens.refresh(login.refreshToken());
        assertEquals(t.id(), next.user().id());
        assertNotNull(decoder.decode(next.token()));
        assertNotEquals(login.refreshToken(), next.refreshToken());

        assertEquals(401, status(() -> refreshTokens.refresh(login.refreshToken())));   // single use
        assertNotNull(refreshTokens.refresh(next.refreshToken()));                      // the new one works
    }

    @Test
    void unknownBlankAndExpiredTokensAre401() {
        tech("t@x");
        assertEquals(401, status(() -> refreshTokens.refresh("not-a-token")));
        assertEquals(401, status(() -> refreshTokens.refresh("")));
        assertEquals(401, status(() -> refreshTokens.refresh(null)));

        LoginResponse login = auth.login("t@x", "password123", "1.1.1.1");
        jdbc.update("UPDATE refresh_token SET expires_at = now() - interval '1 minute'");
        assertEquals(401, status(() -> refreshTokens.refresh(login.refreshToken())));
    }

    @Test
    void deactivatedUserCannotRefresh() {
        UserView admin = users.create(new CreateUserRequest("Admin", "a@x", "password123", "admin", null));
        UserView t = tech("t@x");
        LoginResponse login = auth.login("t@x", "password123", "1.1.1.1");
        users.setActive(t.id(), false);
        assertEquals(401, status(() -> refreshTokens.refresh(login.refreshToken())));
        assertNotEquals(admin.id(), t.id());
    }

    @Test
    void passwordResetAndPasswordChangeKillEveryRefreshToken() {
        UserView t = tech("t@x");
        LoginResponse phone = auth.login("t@x", "password123", "1.1.1.1");
        LoginResponse browser = auth.login("t@x", "password123", "1.1.1.2");

        users.resetPassword(t.id(), "brand-new-pass");
        assertEquals(401, status(() -> refreshTokens.refresh(phone.refreshToken())));
        assertEquals(401, status(() -> refreshTokens.refresh(browser.refreshToken())));
        assertEquals(0, count("refresh_token"));

        LoginResponse again = auth.login("t@x", "brand-new-pass", "1.1.1.1");
        users.changeMyPassword(t.id(), "brand-new-pass", "another-pass-1");
        assertEquals(401, status(() -> refreshTokens.refresh(again.refreshToken())));
    }

    @Test
    void logoutRevokesTheRefreshTokenAndIgnoresJunk() {
        tech("t@x");
        LoginResponse login = auth.login("t@x", "password123", "1.1.1.1");
        refreshTokens.revoke(login.refreshToken());
        refreshTokens.revoke("junk");
        refreshTokens.revoke(null);
        assertEquals(401, status(() -> refreshTokens.refresh(login.refreshToken())));
    }

    @Test
    void deletingAUserDeletesTheirRefreshTokens() {
        UserView admin = users.create(new CreateUserRequest("Admin", "a@x", "password123", "admin", null));
        UserView t = tech("t@x");
        auth.login("t@x", "password123", "1.1.1.1");
        assertEquals(1, count("refresh_token"));
        users.delete(t.id(), new rs.elgor.nalog.domain.AuthUser(admin.id(), "Admin", "admin"));
        assertEquals(0, count("refresh_token"));
    }
}
