package rs.elgor.nalog.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "nalog_photo")
@Getter
@Setter
@NoArgsConstructor
public class NalogPhoto {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "nalog_id", nullable = false)
    private Long nalogId;

    @Column(nullable = false, length = 80, unique = true)
    private String filename;

    @Column(name = "original_name", length = 255)
    private String originalName;

    @Column(length = 255)
    private String caption;

    @Column(nullable = false, length = 10)
    private String category = "other";

    @Column(name = "content_type", nullable = false, length = 30)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "uploaded_by_id")
    private Long uploadedById;

    @Column(name = "uploaded_by_name", length = 150)
    private String uploadedByName;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
}
