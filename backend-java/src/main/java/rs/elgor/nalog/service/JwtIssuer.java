package rs.elgor.nalog.service;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Component;
import rs.elgor.nalog.domain.AppUser;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * The one place that issues login tokens: HS256, payload {id, role, name}, 12 hours, signed with JWT_SECRET.
 * Same format the Node backend used, so tokens that phones and browsers already hold keep working after the switch.
 */
@Component
public class JwtIssuer {

    static final Duration LIFETIME = Duration.ofHours(12);

    private final JwtEncoder encoder;

    public JwtIssuer(@Value("${nalog.security.jwt-secret}") String secret) {
        byte[] key = secret.getBytes(StandardCharsets.UTF_8);
        if (key.length < 32) {
            throw new IllegalStateException("JWT_SECRET must be at least 32 bytes long");
        }
        SecretKey k = new SecretKeySpec(key, "HmacSHA256");
        this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(k));
    }

    public String issue(AppUser u) {
        return issue(u, Instant.now());
    }

    String issue(AppUser u, Instant now) {
        Instant iat = now.truncatedTo(ChronoUnit.SECONDS);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .claim("id", u.getId())
                .claim("role", u.getRole())
                .claim("name", u.getName())
                .issuedAt(iat)
                .expiresAt(iat.plus(LIFETIME))
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }
}
