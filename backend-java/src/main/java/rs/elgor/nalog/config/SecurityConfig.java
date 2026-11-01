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
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Auth = the SAME JWT the Node ServiceHub issues at /api/auth/login
 * (HS256, payload {id, role, name}, signed with JWT_SECRET). One login, both backends.
 * This service only VALIDATES tokens; it never issues them.
 *
 * A valid signature is not enough: NodeSessionFilter asks Node whether the account is still
 * active (cached ~30 s), so deactivation/deletion/role changes take effect within a minute.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, JwtAuthenticationConverter converter,
            @Value("${nalog.auth.validate-with-node:true}") boolean validateWithNode,
            @Value("${nalog.auth.node-url:http://localhost:4000}") String nodeUrl,
            @Value("${nalog.auth.cache-seconds:30}") long cacheSeconds,
            @Value("${nalog.auth.grace-seconds:600}") long graceSeconds) throws Exception {
        http
            .csrf(csrf -> csrf.disable())                       // stateless bearer-token API, no cookies
            .cors(Customizer.withDefaults())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a -> a.anyRequest().authenticated())
            .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(converter)));
        if (validateWithNode) {
            // not a @Bean on purpose: a bean filter would also be registered a second time in the servlet container
            http.addFilterAfter(new NodeSessionFilter(new NodeSessionValidator(nodeUrl,
                    cacheSeconds * 1000, graceSeconds * 1000, System::currentTimeMillis)),
                    org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter.class);
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

    /** role claim "admin" / "technician"  ->  ROLE_ADMIN / ROLE_TECHNICIAN */
    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter c = new JwtAuthenticationConverter();
        c.setJwtGrantedAuthoritiesConverter(jwt -> {
            String role = jwt.getClaimAsString("role");
            return role == null
                    ? List.<GrantedAuthority>of()
                    : List.<GrantedAuthority>of(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase()));
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
