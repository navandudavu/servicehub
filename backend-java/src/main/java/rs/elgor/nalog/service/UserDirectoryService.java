package rs.elgor.nalog.service;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import rs.elgor.nalog.domain.AuthUser;

/** Turns the caller's (already verified) JWT into an AuthUser. Accounts themselves live in app_user. */
@Service
public class UserDirectoryService {

    public AuthUser resolve(Jwt jwt) {
        Object id = jwt.getClaim("id");
        if (!(id instanceof Number)) {
            throw new IllegalStateException("JWT has no numeric 'id' claim");
        }
        String name = jwt.getClaimAsString("name");
        return new AuthUser(((Number) id).longValue(), name == null ? "unknown" : name, jwt.getClaimAsString("role"));
    }
}
