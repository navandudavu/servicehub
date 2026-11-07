package rs.elgor.nalog;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.dto.AccountDtos.*;
import rs.elgor.nalog.service.AuthService;
import rs.elgor.nalog.service.LoginBlockedException;
import rs.elgor.nalog.service.NalogException;
import rs.elgor.nalog.service.UserAdminService;

import static org.junit.jupiter.api.Assertions.*;

/** Accounts end to end against the real database: create, login, token, revocation, last-admin guard. */
class AccountsIntegrationTest extends AbstractIntegrationTest {

    @Autowired UserAdminService users;
    @Autowired AuthService auth;
    @Autowired JwtDecoder decoder;

    private UserView admin(String email) {
        return users.create(new CreateUserRequest("Admin " + email, email, "password123", "admin", null));
    }

    @Test
    void firstUserGetsAnIdAndCanLogIn() {
        UserView a = admin("a@x");
        LoginResponse r = auth.login("a@x", "password123", "1.1.1.1");
        assertEquals(a.id(), r.user().id());
        Jwt jwt = decoder.decode(r.token());                         // signed with the same secret the resource server checks
        assertEquals("admin", jwt.getClaimAsString("role"));
        assertEquals(a.id(), ((Number) jwt.getClaim("id")).longValue());
        assertNotNull(jwt.getIssuedAt());
    }

    @Test
    void emailLoginIsCaseInsensitiveAndWrongPasswordIs401() {
        admin("a@x");
        assertNotNull(auth.login("A@X", "password123", "1.1.1.1"));
        NalogException e = assertThrows(NalogException.class, () -> auth.login("a@x", "nope-nope", "1.1.1.1"));
        assertEquals(401, e.getStatus().value());
    }

    @Test
    void tooManyFailuresAreBlocked() {
        admin("a@x");
        for (int i = 0; i < 8; i++) {
            assertThrows(NalogException.class, () -> auth.login("a@x", "wrong-wrong", "7.7.7.7"));
        }
        assertThrows(LoginBlockedException.class, () -> auth.login("a@x", "password123", "7.7.7.7"));
    }

    @Test
    void duplicateEmailAndWeakPasswordAreRejected() {
        admin("a@x");
        assertEquals(409, assertThrows(NalogException.class, () -> admin("A@x")).getStatus().value());
        assertEquals(400, assertThrows(NalogException.class,
                () -> users.create(new CreateUserRequest("T", "t@x", "short", "technician", null))).getStatus().value());
    }

    @Test
    void deactivatedUserCannotLogInAndTokensAreRevoked() {
        UserView a = admin("a@x");
        UserView t = users.create(new CreateUserRequest("Tech", "t@x", "password123", "technician", null));
        users.setActive(t.id(), false);
        assertEquals(401, assertThrows(NalogException.class, () -> auth.login("t@x", "password123", "1.1.1.1")).getStatus().value());
        long after = jdbc.queryForObject("SELECT tokens_valid_after FROM app_user WHERE id = ?", Long.class, t.id());
        assertTrue(after > 0);
        assertNotEquals(a.id(), t.id());
    }

    @Test
    void changingMyPasswordRevokesOldTokensAndReturnsANewOne() {
        UserView a = admin("a@x");
        String token = users.changeMyPassword(a.id(), "password123", "another-password");
        assertNotNull(decoder.decode(token));
        assertNotNull(auth.login("a@x", "another-password", "1.1.1.1"));
        assertEquals(401, assertThrows(NalogException.class, () -> auth.login("a@x", "password123", "2.2.2.2")).getStatus().value());
        assertEquals(401, assertThrows(NalogException.class,
                () -> users.changeMyPassword(a.id(), "wrong-password", "third-password")).getStatus().value());
    }

    @Test
    void theLastActiveAdminCannotBeLostInAnyWay() {
        UserView a = admin("a@x");
        AuthUser actor = new AuthUser(999, "Someone", "admin");
        assertEquals(409, assertThrows(NalogException.class, () -> users.setActive(a.id(), false)).getStatus().value());
        assertEquals(409, assertThrows(NalogException.class, () -> users.delete(a.id(), actor)).getStatus().value());
        assertEquals(409, assertThrows(NalogException.class,
                () -> users.update(a.id(), new UpdateUserRequest(null, null, "technician", null), actor)).getStatus().value());
    }

    @Test
    void youCannotDeleteYourselfAndTechniciansCannotEditOthers() {
        UserView a = admin("a@x");
        UserView t = users.create(new CreateUserRequest("Tech", "t@x", "password123", "technician", null));
        assertEquals(400, assertThrows(NalogException.class,
                () -> users.delete(a.id(), new AuthUser(a.id(), "A", "admin"))).getStatus().value());
        assertEquals(403, assertThrows(NalogException.class,
                () -> users.update(a.id(), new UpdateUserRequest("Hacked", null, null, null),
                        new AuthUser(t.id(), "Tech", "technician"))).getStatus().value());
    }

    @Test
    void bootstrapCreatesOneAdminOnlyWhenNobodyCanLogIn() {
        assertTrue(users.bootstrapAdminIfNone("admin@servicehub.local").isPresent());
        assertTrue(users.bootstrapAdminIfNone("admin@servicehub.local").isEmpty());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM app_user", Integer.class));
    }

    @Test
    void newUsersContinueAboveExistingIds() {
        insertUser(41, "Old synced tech", "technician");
        jdbc.queryForObject("SELECT setval('app_user_id_seq', 42, false)", Long.class);
        UserView t = users.create(new CreateUserRequest("New", "n@x", "password123", "technician", null));
        assertTrue(t.id() > 41);
    }
}
