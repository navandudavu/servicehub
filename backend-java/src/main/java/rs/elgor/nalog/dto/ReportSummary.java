package rs.elgor.nalog.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * Money report over COMPLETED nalozi whose completed_at falls in [from, to).
 * Every figure is a plain SUM of the amounts already stored on each nalog (each rounded HALF_UP when it was
 * created), so the report can never disagree with the printed documents. Decimals are strings.
 */
public record ReportSummary(
        Instant from,
        Instant to,
        Totals totals,
        List<Row> byTechnician,
        List<Row> byMonth,
        List<Row> byPayment
) {
    /** key = technician name, "YYYY-MM" (Serbian time) or payment type, depending on the list. */
    public record Row(String key, Totals totals) {}

    public record Totals(
            long count,
            @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal laborHours,
            @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal laborTotal,
            @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal partsTotal,
            @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal subtotal,
            @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal vatAmount,
            @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal total
    ) {}
}
