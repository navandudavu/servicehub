package rs.elgor.nalog.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import rs.elgor.nalog.domain.AppUser;

/**
 * Accounts API. Field names match what the web app and the Android app already send and read
 * (snake_case for the two password fields, like the old Node API). Unknown fields are ignored on purpose here:
 * the clients send a few extras and they must keep working.
 */
public final class AccountDtos {
    private AccountDtos() {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LoginRequest(String email, String password) {}

    public record LoginResponse(String token, UserView user) {}

    public record UserView(Long id, String name, String email, String role, String phone, boolean active) {
        public static UserView from(AppUser u) {
            return new UserView(u.getId(), u.getName(), u.getEmail(), u.getRole(), u.getPhone(), u.isActive());
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record CreateUserRequest(String name, String email, String password, String role, String phone) {}

    /** Every field optional: only what is present changes. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record UpdateUserRequest(String name, String email, String role, String phone) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ActiveRequest(Boolean active) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ResetPasswordRequest(@JsonProperty("new_password") String newPassword) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ChangePasswordRequest(@JsonProperty("current_password") String currentPassword,
                                        @JsonProperty("new_password") String newPassword) {}

    public record ChangePasswordResponse(boolean ok, String token) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PushTokenRequest(String token, String platform) {}
}
