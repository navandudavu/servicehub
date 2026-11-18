package rs.elgor.nalog.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import rs.elgor.nalog.domain.StockDoc;
import rs.elgor.nalog.domain.StockDocLine;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Zaduzenje / Razduzenje DTOs. Mirrored in frontend/src/types/nalog.ts. Quantities travel as strings. */
public final class StockDocDtos {
    private StockDocDtos() {}

    public record LineRequest(
            @NotNull Long partId,
            @NotNull @DecimalMin("0.001") @Digits(integer = 9, fraction = 3) BigDecimal quantity
    ) {}

    /** docAt is optional (blank = now). The document number is assigned by the server. */
    public record CreateRequest(
            @NotNull StockDoc.Type type,
            @NotNull Long technicianId,
            Instant docAt,
            @NotEmpty @Size(max = 100) List<@Valid LineRequest> lines
    ) {}

    /** Admin-level edit: the whole document is replaced; type and number never change. */
    public record UpdateRequest(
            @NotNull Long technicianId,
            @NotNull Instant docAt,
            @NotEmpty @Size(max = 100) List<@Valid LineRequest> lines
    ) {}

    public record LineView(
            Long id,
            Long partId,
            String sku,
            String name,
            String unit,
            @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal quantity
    ) {
        public static LineView from(StockDocLine l) {
            return new LineView(l.getId(), l.getPartId(), l.getSku(), l.getName(), l.getUnit(), l.getQuantity());
        }
    }

    public record DocSummary(
            Long id,
            StockDoc.Type type,
            long docNo,
            Long technicianId,
            String technicianName,
            Instant docAt,
            String createdByName,
            int lineCount
    ) {}

    public record DocView(
            Long id,
            StockDoc.Type type,
            long docNo,
            Long technicianId,
            String technicianName,
            Instant docAt,
            String createdByName,
            String updatedByName,
            List<LineView> lines
    ) {}

    /** An earlier version of an edited document: who replaced it, when, and what it said. */
    public record RevisionView(Instant revisedAt, String revisedByName, String snapshot) {}

    /** One technician + one part over a period: opening + issued - returned = closing. */
    public record BalanceRow(
            Long technicianId,
            String technicianName,
            Long partId,
            String sku,
            String name,
            String unit,
            @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal opening,
            @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal issued,
            @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal returned,
            @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal closing
    ) {}
}
