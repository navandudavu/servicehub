package rs.elgor.nalog.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import rs.elgor.nalog.dto.AccountDtos.*;
import rs.elgor.nalog.service.UserAdminService;
import rs.elgor.nalog.service.UserDirectoryService;

import java.util.List;
import java.util.Map;

/** Team management. Same paths and shapes the old Node backend had. */
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserAdminService users;
    private final UserDirectoryService directory;

    public UserController(UserAdminService users, UserDirectoryService directory) {
        this.users = users;
        this.directory = directory;
    }

    /** Everybody logged in may list the team (names and phones), the web app shows who is who. */
    @GetMapping
    public List<UserView> list() {
        return users.list();
    }

    @PostMapping
    @PreAuthorize("hasRole('OWNER')")
    public ResponseEntity<UserView> create(@RequestBody CreateUserRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(users.create(request));
    }

    /** Admin: anyone. Everybody else: only themselves (checked in the service). */
    @PutMapping("/{id}")
    public UserView update(@PathVariable long id, @RequestBody UpdateUserRequest request, @AuthenticationPrincipal Jwt jwt) {
        return users.update(id, request, directory.resolve(jwt));
    }

    @PatchMapping("/{id}/active")
    @PreAuthorize("hasRole('OWNER')")
    public Map<String, Boolean> setActive(@PathVariable long id, @RequestBody ActiveRequest request) {
        users.setActive(id, request.active());
        return Map.of("ok", true);
    }

    @PatchMapping("/{id}/reset-password")
    @PreAuthorize("hasRole('OWNER')")
    public Map<String, Boolean> resetPassword(@PathVariable long id, @RequestBody ResetPasswordRequest request) {
        users.resetPassword(id, request.newPassword());
        return Map.of("ok", true);
    }

    /** Self-service. Every other session is logged out; this response carries a fresh token for the caller. */
    @PatchMapping("/me/password")
    public ChangePasswordResponse changeMyPassword(@RequestBody ChangePasswordRequest request, @AuthenticationPrincipal Jwt jwt) {
        String token = users.changeMyPassword(directory.resolve(jwt).id(), request.currentPassword(), request.newPassword());
        return new ChangePasswordResponse(true, token);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('OWNER')")
    public Map<String, Boolean> delete(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        users.delete(id, directory.resolve(jwt));
        return Map.of("ok", true);
    }
}
