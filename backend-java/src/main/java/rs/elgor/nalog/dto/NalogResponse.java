package rs.elgor.nalog.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import rs.elgor.nalog.domain.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * Output contract. Every BigDecimal is serialised as a JSON STRING ("1250.00"),
 * so JavaScript never parses money into a binary double on the way in.
 * Mirrored by NalogResponse in frontend/src/types/nalog.ts.
 */
public record NalogResponse(
        Long id,
        String nalogNumber,
        NalogStatus status,
        CustomerView customer,
        ApplianceView appliance,
        String diagnosis,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal laborHours,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal laborRate,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal laborTotal,
        List<PartLineView> partLines,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal partsTotal,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal subtotal,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal vatRate,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal vatAmount,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal total,
        PaymentType paymentType,
        String createdByName,
        Long assignedToId,
        String assignedToName,
        Instant scheduledAt,
        Instant completedAt,
        Instant createdAt,
        Instant updatedAt
) {

    public record CustomerView(Long id, String fullName, String address, String city,
                               String phone, String email, String locationNotes) {}

    public record ApplianceView(ApplianceType type, String brand, String model, String serialNumber) {}

    public record PartLineView(Long partId, String sku, String name,
                               @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal unitPrice,
                               int quantity,
                               @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal lineTotal) {}

    /** Call inside a transaction: touches lazy associations. */
    public static NalogResponse from(Nalog n) {
        Customer c = n.getCustomer();
        return new NalogResponse(
                n.getId(),
                n.getNalogNumber(),
                n.getStatus(),
                new CustomerView(c.getId(), c.getFullName(), c.getAddress(), c.getCity(),
                        c.getPhone(), c.getEmail(), c.getLocationNotes()),
                new ApplianceView(n.getApplianceType(), n.getApplianceBrand(),
                        n.getApplianceModel(), n.getSerialNumber()),
                n.getDiagnosis(),
                n.getLaborHours(), n.getLaborRate(), n.getLaborTotal(),
                n.getPartLines().stream()
                        .map(l -> new PartLineView(l.getPart().getId(), l.getPartSku(), l.getPartName(),
                                l.getUnitPrice(), l.getQuantity(), l.getLineTotal()))
                        .toList(),
                n.getPartsTotal(), n.getSubtotal(), n.getVatRate(), n.getVatAmount(), n.getTotal(),
                n.getPaymentType(), n.getCreatedByName(), n.getAssignedToId(), n.getAssignedToName(), n.getScheduledAt(), n.getCompletedAt(),
                n.getCreatedAt(), n.getUpdatedAt());
    }
}
