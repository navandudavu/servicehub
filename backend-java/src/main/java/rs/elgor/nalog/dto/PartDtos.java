package rs.elgor.nalog.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.*;
import rs.elgor.nalog.domain.Part;

import java.math.BigDecimal;

/** Inventory DTOs. Mirrored in frontend/src/types/nalog.ts. */
public final class PartDtos {
    private PartDtos() {}

    public record CreatePartRequest(
            @NotBlank @Size(max = 60) String sku,
            @NotBlank @Size(max = 200) String name,
            @NotNull @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) BigDecimal unitPrice,
            @Min(0) @Max(1_000_000) int stockQty
    ) {}

    public record UpdatePartRequest(
            @NotBlank @Size(max = 200) String name,
            @NotNull @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) BigDecimal unitPrice,
            boolean active
    ) {}

    /** delta may be negative (write-off, count correction). Result below zero is rejected. */
    public record StockAdjustRequest(
            @Min(-1_000_000) @Max(1_000_000) int delta,
            @Size(max = 255) String note
    ) {}

    /** One row of the append-only stock ledger, newest first. */
    public record StockMovementView(
            Long id,
            int delta,
            String reason,
            String note,
            Long nalogId,
            String actorName,
            java.time.Instant createdAt
    ) {
        public static StockMovementView from(rs.elgor.nalog.domain.StockMovement m) {
            return new StockMovementView(m.getId(), m.getDelta(), m.getReason().name(), m.getNote(),
                    m.getNalogId(), m.getActorName(), m.getCreatedAt());
        }
    }

    public record PartResponse(
            Long id,
            String sku,
            String name,
            @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal unitPrice,
            int stockQty,
            boolean active
    ) {
        public static PartResponse from(Part p) {
            return new PartResponse(p.getId(), p.getSku(), p.getName(), p.getUnitPrice(), p.getStockQty(), p.isActive());
        }
    }
}
