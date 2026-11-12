package rs.elgor.nalog.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import rs.elgor.nalog.repo.AppUserRepository;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;

/**
 * Auth = a JWT (HS256, payload {id, role, name}, signed with JWT_SECRET) that this service issues at /api/auth/login
 * (JwtIssuer) and validates on every other request. SessionCheckFilter then confirms the account is still valid
 * (exists, active, same role, token newer than the last password change), so deactivation takes effect immediately.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    /** Reachable without a token. A stale token in the header of a login request must not break the login either. */
    private static final Set<String> PUBLIC_PATHS = Set.of("/api/auth/login", "/api/health");

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, JwtAuthenticationConverter converter,
            AppUserRepository users,
            @Value("${nalog.auth.check-session:true}") boolean checkSession) throws Exception {
        DefaultBearerTokenResolver defaultResolver = new DefaultBearerTokenResolver();
        BearerTokenResolver resolver = request -> PUBLIC_PATHS.contains(request.getRequestURI())
                ? null : defaultResolver.resolve(request);
        http
            .csrf(csrf -> csrf.disable())                       // stateless bearer-token API, no cookies
            .cors(Customizer.withDefaults())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a -> a
                    .requestMatchers(PUBLIC_PATHS.toArray(new String[0])).permitAll()
                    .anyRequest().authenticated())
            .oauth2ResourceServer(o -> o.bearerTokenResolver(resolver).jwt(j -> j.jwtAuthenticationConverter(converter)));
        if (checkSession) {
            // not a @Bean on purpose: a bean filter would also be registered a second time in the servlet container
            http.addFilterAfter(new SessionCheckFilter(users), BearerTokenAuthenticationFilter.class);
        }
        return http.build();
    }

    @Bean
    JwtDecoder jwtDecoder(@Value("${nalog.security.jwt-secret}") String secret) {
        byte[] key = secret.getBytes(StandardCharsets.UTF_8);
        if (key.length < 32) {
            // fail fast at startup rather than run with a guessable signing key
            throw new IllegalStateException("JWT_SECRET must be at least 32 bytes long");
        }
        return NimbusJwtDecoder
                .withSecretKey(new SecretKeySpec(key, "HmacSHA256"))
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
    }

    /**
     * role claim -> authorities.  admin: ROLE_ADMIN + ROLE_OWNER;  manager: ROLE_MANAGER + ROLE_ADMIN (admin-level, no team
     * management);  technician: ROLE_TECHNICIAN.
     */
    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter c = new JwtAuthenticationConverter();
        c.setJwtGrantedAuthoritiesConverter(jwt -> {
            String role = jwt.getClaimAsString("role");
            if (role == null) {
                return List.<GrantedAuthority>of();
            }
            String r = role.toUpperCase();
            List<GrantedAuthority> out = new java.util.ArrayList<>();
            out.add(new SimpleGrantedAuthority("ROLE_" + r));
            if ("ADMIN".equals(r)) {
                out.add(new SimpleGrantedAuthority("ROLE_OWNER"));
            } else if ("MANAGER".equals(r)) {
                out.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
            }
            return out;
        });
        return c;
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${nalog.cors.allowed-origins}") List<String> origins) {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(origins);
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("Authorization", "Content-Type", "Idempotency-Key"));
        cfg.setExposedHeaders(List.of("Location"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cfg);
        return source;
    }
}
