package rs.elgor.nalog.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** Append-only note on a nalog. See V5__nalog_notes.sql. */
@Entity
@Table(name = "nalog_note")
@Getter
@Setter
@NoArgsConstructor
public class NalogNote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "nalog_id", nullable = false)
    private Long nalogId;

    @Column(name = "author_id")
    private Long authorId;

    @Column(name = "author_name", nullable = false, length = 150)
    private String authorName;

    @Column(nullable = false, length = 2000)
    private String body;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
}
