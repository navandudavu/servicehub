package rs.elgor.nalog.dto;

import jakarta.validation.constraints.*;
import rs.elgor.nalog.domain.CarriedItem;

/** Zaduzivanje DTOs. Mirrored in frontend/src/types/nalog.ts. */
public final class CarriedDtos {
    private CarriedDtos() {}

    /** technicianId is only used by admins (whose list it is); a technician always means himself. */
    public record CarriedRequest(
            @Size(max = 60) String sku,
            @NotBlank @Size(max = 200) String name,
            @Min(0) @Max(1_000_000) int quantity,
            Long technicianId
    ) {}

    public record CarriedView(Long id, Long technicianId, String sku, String name, int quantity) {
        public static CarriedView from(CarriedItem c) {
            return new CarriedView(c.getId(), c.getTechnicianId(), c.getSku(), c.getName(), c.getQuantity());
        }
    }
}
