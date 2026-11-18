package rs.elgor.nalog.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

/** One item of a stock document. sku/name/unit are snapshots of the part at the time of issuing. */
@Entity
@Table(name = "stock_doc_line")
@Getter
@Setter
@NoArgsConstructor
public class StockDocLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "doc_id", nullable = false)
    private StockDoc doc;

    /** Null only for lines carried over from the old flat list that matched no part. */
    @Column(name = "part_id")
    private Long partId;

    @Column(length = 60)
    private String sku;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(nullable = false, length = 20)
    private String unit = "kom";

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal quantity;
}
