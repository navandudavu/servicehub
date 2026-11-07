package rs.elgor.nalog.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** A ServiceHub account (login, role, password hash). The only place accounts live. */
@Entity
@Table(name = "app_user")
@Getter
@Setter
@NoArgsConstructor
public class AppUser {

    @Id
    private Long id;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(nullable = false, length = 20)
    private String role;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt = Instant.now();

    @Column(length = 150)
    private String email;

    @Column(name = "password_hash", length = 100)
    private String passwordHash;

    @Column(length = 40)
    private String phone;

    /** Unix seconds. A token issued before this moment is refused (password change, reset, deactivation). */
    @Column(name = "tokens_valid_after", nullable = false)
    private long tokensValidAfter;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public boolean isTechnician() {
        return "technician".equalsIgnoreCase(role);
    }
}
