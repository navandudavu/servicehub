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

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Runs right after the bearer-token filter: a signed token is not enough, Node must still accept the account. */
public class NodeSessionFilter extends OncePerRequestFilter {

    private final NodeSessionValidator validator;

    public NodeSessionFilter(NodeSessionValidator validator) {
        this.validator = validator;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwtAuth) {
            Jwt jwt = jwtAuth.getToken();
            NodeSessionValidator.Result r = validator.check(jwt.getTokenValue(), jwt.getClaimAsString("role"));
            if (r == NodeSessionValidator.Result.REVOKED) {
                SecurityContextHolder.clearContext();
                response.setHeader("WWW-Authenticate", "Bearer error=\"invalid_token\"");
                write(response, 401, "Unauthorized", "Your session is no longer valid. Log in again.");
                return;
            }
            if (r == NodeSessionValidator.Result.UNAVAILABLE) {
                SecurityContextHolder.clearContext();
                write(response, 503, "Service Unavailable", "The account service is not reachable right now. Try again in a moment.");
                return;
            }
        }
        chain.doFilter(request, response);
    }

    private static void write(HttpServletResponse res, int status, String title, String detail) throws IOException {
        res.setStatus(status);
        res.setContentType("application/problem+json");
        res.setCharacterEncoding(StandardCharsets.UTF_8.name());
        res.getWriter().write("{\"title\":\"" + title + "\",\"status\":" + status + ",\"detail\":\"" + detail + "\"}");
    }
}
