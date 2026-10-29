package rs.elgor.nalog.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** Append-only inventory ledger: parts.stock_qty == SUM(delta) for that part. */
@Entity
@Table(name = "stock_movement")
@Getter
@Setter
@NoArgsConstructor
public class StockMovement {

    public enum Reason { INITIAL, MANUAL, NALOG_CREATE, NALOG_CANCEL }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "part_id", nullable = false)
    private Long partId;

    @Column(nullable = false)
    private int delta;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Reason reason;

    @Column(length = 255)
    private String note;

    @Column(name = "nalog_id")
    private Long nalogId;

    @Column(name = "actor_id")
    private Long actorId;

    @Column(name = "actor_name", length = 150)
    private String actorName;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public static StockMovement of(Long partId, int delta, Reason reason, Long nalogId, AuthUser actor, String note) {
        StockMovement m = new StockMovement();
        m.partId = partId;
        m.delta = delta;
        m.reason = reason;
        m.nalogId = nalogId;
        m.note = note;
        if (actor != null) {
            m.actorId = actor.id();
            m.actorName = actor.name();
        }
        return m;
    }
}
