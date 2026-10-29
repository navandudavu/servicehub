package rs.elgor.nalog.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.List;

/** Ask the BACKEND "what would this cost?" - so the form never does money maths (RULE A). */
public record PreviewRequest(
        @Valid @Size(max = 50) List<CreateNalogRequest.PartLineInput> partLines,
        @NotNull @DecimalMin("0.00") @DecimalMax("999.99") @Digits(integer = 3, fraction = 2) BigDecimal laborHours
) {
    public PreviewRequest {
        partLines = partLines == null ? List.of() : List.copyOf(partLines);
    }
}
