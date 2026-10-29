package rs.elgor.nalog.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "nalog")
@Getter
@Setter
@NoArgsConstructor
public class Nalog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "nalog_number", nullable = false, unique = true, length = 30)
    private String nalogNumber;

    // Client-generated key; UNIQUE in the DB. Makes POST safe to retry after a timeout.
    @Column(name = "idempotency_key", unique = true, length = 80)
    private String idempotencyKey;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "customer_id", nullable = false)
    private Customer customer;

    @Enumerated(EnumType.STRING)
    @Column(name = "appliance_type", nullable = false, length = 30)
    private ApplianceType applianceType;

    @Column(name = "appliance_brand", nullable = false, length = 100)
    private String applianceBrand;

    @Column(name = "appliance_model", length = 100)
    private String applianceModel;

    @Column(name = "serial_number", length = 100)
    private String serialNumber;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String diagnosis;

    @Column(name = "labor_hours", nullable = false, precision = 6, scale = 2)
    private BigDecimal laborHours;

    @Column(name = "labor_rate", nullable = false, precision = 12, scale = 2)
    private BigDecimal laborRate;

    @Column(name = "labor_total", nullable = false, precision = 12, scale = 2)
    private BigDecimal laborTotal;

    @Column(name = "parts_total", nullable = false, precision = 12, scale = 2)
    private BigDecimal partsTotal;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal subtotal;

    @Column(name = "vat_rate", nullable = false, precision = 5, scale = 4)
    private BigDecimal vatRate;

    @Column(name = "vat_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal vatAmount;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal total;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_type", nullable = false, length = 20)
    private PaymentType paymentType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NalogStatus status = NalogStatus.DRAFT;

    @OneToMany(mappedBy = "nalog", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<NalogPartLine> partLines = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // Who created it (from the ServiceHub JWT) and when it was completed.
    @Column(name = "created_by_id")
    private Long createdById;

    @Column(name = "created_by_name", length = 150)
    private String createdByName;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "assigned_to_id")
    private Long assignedToId;

    @Column(name = "assigned_to_name", length = 150)
    private String assignedToName;

    @Column(name = "scheduled_at")
    private Instant scheduledAt;

    // Set only by the SQLite import; makes the import re-runnable without duplicates.
    @Column(name = "legacy_job_id", unique = true)
    private Long legacyJobId;

    @Version
    private Long version;

    /** Keeps both sides of the relationship in sync. */
    public void addPartLine(NalogPartLine line) {
        line.setNalog(this);
        partLines.add(line);
    }

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
