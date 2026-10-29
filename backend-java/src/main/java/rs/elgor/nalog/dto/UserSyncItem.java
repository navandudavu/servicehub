package rs.elgor.nalog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** One ServiceHub account (as listed by the Node /api/users), pushed in by the admin's browser. No passwords. */
public record UserSyncItem(
        @NotNull Long id,
        @NotBlank @Size(max = 150) String name,
        @NotBlank String role,
        boolean active
) {}
