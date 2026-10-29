package rs.elgor.nalog.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.util.List;

/** Same numbers the real create would produce right now. Nothing is saved or reserved. */
public record NalogPreview(
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal laborHours,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal laborRate,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal laborTotal,
        List<NalogResponse.PartLineView> partLines,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal partsTotal,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal subtotal,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal vatRate,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal vatAmount,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal total
) {}
