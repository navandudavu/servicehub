package rs.elgor.nalog.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;
import rs.elgor.nalog.domain.AppUser;
import rs.elgor.nalog.repo.AppUserRepository;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;

/**
 * Runs right after the bearer-token filter. A valid signature is not enough: the account must still exist, be active,
 * still have the role in the token, and the token must be newer than the last password change / reset / deactivation.
 * One primary-key lookup per request, so a deactivated or demoted user loses access on their very next request.
 */
public class SessionCheckFilter extends OncePerRequestFilter {

    private final AppUserRepository users;

    public SessionCheckFilter(AppUserRepository users) {
        this.users = users;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwtAuth && !stillValid(jwtAuth.getToken())) {
            SecurityContextHolder.clearContext();
            response.setHeader("WWW-Authenticate", "Bearer error=\"invalid_token\"");
            String msg = "Your session is no longer valid. Log in again.";
            response.setStatus(401);
            response.setContentType("application/problem+json");
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write("{\"title\":\"Unauthorized\",\"status\":401,\"detail\":\"" + msg + "\",\"error\":\"" + msg + "\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    private boolean stillValid(Jwt jwt) {
        Object id = jwt.getClaim("id");
        if (!(id instanceof Number n) || n.longValue() <= 0) {
            return false;
        }
        AppUser u = users.findById(n.longValue()).orElse(null);
        if (u == null || !u.isActive() || !u.getRole().equalsIgnoreCase(String.valueOf(jwt.getClaimAsString("role")))) {
            return false;
        }
        Instant iat = jwt.getIssuedAt();
        long issued = iat == null ? 0 : iat.getEpochSecond();
        return u.getTokensValidAfter() <= 0 || issued >= u.getTokensValidAfter();
    }
}
