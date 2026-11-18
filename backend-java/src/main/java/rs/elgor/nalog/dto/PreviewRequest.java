package rs.elgor.nalog.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;

/** Ask the BACKEND "what would this cost?" - so the form never does money maths (RULE A). */
public record PreviewRequest(
        @NotNull @DecimalMin("0.00") @DecimalMax("999.99") @Digits(integer = 3, fraction = 2) BigDecimal laborHours,
        @DecimalMin("0.00") @Digits(integer = 8, fraction = 2) BigDecimal price,
        // Optional: when editing, price against THIS nalog (its stored price when none is typed).
        Long nalogId
) {}
