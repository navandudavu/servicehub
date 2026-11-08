package rs.elgor.nalog.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import rs.elgor.nalog.dto.AccountDtos.*;
import rs.elgor.nalog.service.AuthService;
import rs.elgor.nalog.service.PushTokenService;
import rs.elgor.nalog.service.UserDirectoryService;

import java.time.Instant;
import java.util.Map;

/** Login, "who am I", and the phone's push token. Same paths and shapes the old Node backend had. */
@RestController
public class AuthController {

    private final AuthService auth;
    private final PushTokenService pushTokens;
    private final UserDirectoryService directory;

    public AuthController(AuthService auth, PushTokenService pushTokens, UserDirectoryService directory) {
        this.auth = auth;
        this.pushTokens = pushTokens;
        this.directory = directory;
    }

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        return Map.of("ok", true, "time", Instant.now().toString());
    }

    /** Public. getRemoteAddr is the real client address behind Caddy (server.forward-headers-strategy=native). */
    @PostMapping("/api/auth/login")
    public LoginResponse login(@RequestBody LoginRequest request, HttpServletRequest http) {
        return auth.login(request.email(), request.password(), http.getRemoteAddr());
    }

    @GetMapping("/api/auth/me")
    public UserView me(@AuthenticationPrincipal Jwt jwt) {
        return auth.me(directory.resolve(jwt).id());
    }

    @PostMapping("/api/auth/token")
    public ResponseEntity<Void> registerPushToken(@RequestBody PushTokenRequest request, @AuthenticationPrincipal Jwt jwt) {
        pushTokens.register(directory.resolve(jwt).id(), request.token(), request.platform());
        return ResponseEntity.noContent().build();
    }
}
