package rs.elgor.nalog.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import rs.elgor.nalog.domain.ApplianceType;
import rs.elgor.nalog.domain.NalogStatus;
import rs.elgor.nalog.domain.PaymentType;

import java.math.BigDecimal;
import java.util.List;

/**
 * Input contract for POST /api/nalozi. Mirrored 1:1 by CreateNalogRequest in
 * frontend/src/types/nalog.ts - change one, change the other.
 *
 * Deliberately ABSENT: any price, rate, subtotal, VAT or total. The client cannot
 * send money values, so it cannot send wrong ones (RULE A).
 */
public record CreateNalogRequest(

        // Exactly one of customerId / newCustomer must be given (checked in the service).
        Long customerId,
        @Valid CustomerInput newCustomer,

        @NotNull @Valid ApplianceInput appliance,

        @NotBlank @Size(max = 4000) String diagnosis,

        @Valid @Size(max = 50) List<PartLineInput> partLines,

        // Sent as a string ("1.50") from the frontend; parsed straight into BigDecimal,
        // never through a double.
        @NotNull @DecimalMin("0.00") @DecimalMax("999.99") @Digits(integer = 3, fraction = 2)
        BigDecimal laborHours,

        @NotNull PaymentType paymentType,

        // Optional. Only DRAFT (default) or DISPATCHED are legal on creation.
        NalogStatus status,

        // Optional planned visit time (ISO-8601 instant, UTC).
        java.time.Instant scheduledAt,

        // Admin only. A technician creating a nalog is always assigned to themselves.
        Long assignedToId
) {

    public CreateNalogRequest {
        // null-safe: callers may omit partLines entirely
        partLines = partLines == null ? List.of() : List.copyOf(partLines);
    }

    public record CustomerInput(
            @NotBlank @Size(max = 150) String fullName,
            @NotBlank @Size(max = 255) String address,
            @Size(max = 100) String city,
            @NotBlank @Size(max = 40) @Pattern(regexp = "^[0-9+()/.\\-\\s]{6,40}$", message = "invalid phone number") String phone,
            @Email @Size(max = 150) String email,
            @Size(max = 500) String locationNotes
    ) {}

    public record ApplianceInput(
            @NotNull ApplianceType type,
            @NotBlank @Size(max = 100) String brand,
            @Size(max = 100) String model,
            @Size(max = 100) String serialNumber
    ) {}

    public record PartLineInput(
            @NotNull Long partId,
            @Min(1) @Max(999) int quantity
    ) {}
}
