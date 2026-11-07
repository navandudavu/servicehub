package rs.elgor.nalog.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import rs.elgor.nalog.domain.ApplianceType;
import rs.elgor.nalog.domain.NalogStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Customers page. Mirrored by CustomerInput / CustomerDetail in frontend/src/types/nalog.ts. */
public final class CustomerDtos {
    private CustomerDtos() {}

    /** Create and edit use the same shape: the whole record is sent. */
    public record CustomerRequest(
            @NotBlank @Size(max = 150) String fullName,
            @NotBlank @Size(max = 255) String address,
            @Size(max = 100) String city,
            @NotBlank @Size(max = 40) String phone,
            @Size(max = 150) String email,
            @Size(max = 500) String locationNotes) {}

    /** One line of the customer's history. The appliance is on the nalog itself (there is no appliance table). */
    public record CustomerNalog(
            Long id,
            String nalogNumber,
            NalogStatus status,
            Instant createdAt,
            ApplianceType applianceType,
            String applianceBrand,
            String applianceModel,
            @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal total) {}

    public record CustomerDetail(NalogResponse.CustomerView customer, List<CustomerNalog> nalozi) {}
}
