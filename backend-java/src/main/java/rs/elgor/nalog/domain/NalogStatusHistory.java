package rs.elgor.nalog.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** Append-only log of status changes. */
@Entity
@Table(name = "nalog_status_history")
@Getter
@Setter
@NoArgsConstructor
public class NalogStatusHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "nalog_id", nullable = false)
    private Long nalogId;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 20)
    private NalogStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false, length = 20)
    private NalogStatus toStatus;

    @Column(name = "changed_by_id")
    private Long changedById;

    @Column(name = "changed_by_name", length = 150)
    private String changedByName;

    @Column(name = "changed_at", nullable = false)
    private Instant changedAt = Instant.now();
}
