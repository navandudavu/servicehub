package rs.elgor.nalog.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import rs.elgor.nalog.domain.PaymentType;

import java.math.BigDecimal;
import java.util.List;

/**
 * Input contract for PUT /api/nalozi/{id}. Mirrored by UpdateNalogRequest in frontend/src/types/nalog.ts.
 *
 * Like the create request it carries NO money: the totals are recomputed on the server (RULE A), using the
 * labor rate and VAT rate the nalog was created with, and the part prices it already holds.
 * Status, planned visit and assignment are NOT editable here; they have their own endpoints.
 *
 * expectedVersion is the "version" from the NalogResponse the form was filled from. If someone changed the nalog
 * in the meantime the server answers 409 instead of silently overwriting their work.
 */
public record UpdateNalogRequest(

        // Exactly one of customerId / newCustomer must be given (same rule as on create).
        Long customerId,
        @Valid CreateNalogRequest.CustomerInput newCustomer,

        @NotNull @Valid CreateNalogRequest.ApplianceInput appliance,

        @NotBlank @Size(max = 4000) String diagnosis,

        // "Izvrseni radovi". Optional while the nalog is open, required to close it.
        @Size(max = 4000) String workDone,

        @Valid @Size(max = 50) List<CreateNalogRequest.PartLineInput> partLines,

        @NotNull @DecimalMin("0.00") @DecimalMax("999.99") @Digits(integer = 3, fraction = 2)
        BigDecimal laborHours,

        // Hand-typed price. Optional: when omitted the nalog keeps the price it has.
        @DecimalMin("0.00") @Digits(integer = 8, fraction = 2) BigDecimal price,

        @NotNull PaymentType paymentType,

        @NotNull Long expectedVersion
) {

    public UpdateNalogRequest {
        partLines = partLines == null ? List.of() : List.copyOf(partLines);
    }
}
