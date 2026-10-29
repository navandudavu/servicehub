package rs.elgor.nalog.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import rs.elgor.nalog.domain.*;

import java.math.BigDecimal;
import java.time.Instant;

/** Row shown in the list view. Deliberately light: no part lines, no diagnosis. */
public record NalogSummary(
        Long id,
        String nalogNumber,
        NalogStatus status,
        String customerName,
        String customerPhone,
        ApplianceType applianceType,
        String applianceBrand,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal total,
        PaymentType paymentType,
        String assignedToName,
        Instant createdAt
) {
    public static NalogSummary from(Nalog n) {
        return new NalogSummary(n.getId(), n.getNalogNumber(), n.getStatus(),
                n.getCustomer().getFullName(), n.getCustomer().getPhone(),
                n.getApplianceType(), n.getApplianceBrand(),
                n.getTotal(), n.getPaymentType(), n.getAssignedToName(), n.getCreatedAt());
    }
}
