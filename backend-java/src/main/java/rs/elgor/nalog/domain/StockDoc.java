package rs.elgor.nalog.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** A numbered Zaduzenje (ZAD) or Razduzenje (RAZ) document for one technician. Never deleted. */
@Entity
@Table(name = "stock_doc")
@Getter
@Setter
@NoArgsConstructor
public class StockDoc {

    public enum Type { ZAD, RAZ }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "doc_type", nullable = false, length = 3)
    private Type type;

    @Column(name = "doc_no", nullable = false)
    private long docNo;

    @Column(name = "technician_id", nullable = false)
    private Long technicianId;

    @Column(name = "doc_at", nullable = false)
    private Instant docAt;

    @Column(name = "created_by", nullable = false, updatable = false)
    private Long createdBy;

    @Column(name = "created_by_name", nullable = false, updatable = false, length = 150)
    private String createdByName;

    @Column(name = "updated_by_name", length = 150)
    private String updatedByName;

    /** Set when the document was made automatically from the Materijal of a nalog. */
    @Column(name = "nalog_id")
    private Long nalogId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @OneToMany(mappedBy = "doc", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<StockDocLine> lines = new ArrayList<>();

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
