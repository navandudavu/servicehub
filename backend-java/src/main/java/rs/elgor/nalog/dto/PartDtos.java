package rs.elgor.nalog.dto;

import jakarta.validation.constraints.*;
import rs.elgor.nalog.domain.Part;

/** Magacin DTOs (sifra, naziv, jedinica mere). Mirrored in frontend/src/types/nalog.ts. */
public final class PartDtos {
    private PartDtos() {}

    public record CreatePartRequest(
            @NotBlank @Size(max = 60) String sku,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 20) String unit                                                       // optional: blank = "kom"
    ) {}

    public record UpdatePartRequest(
            @NotBlank @Size(max = 200) String name,
            boolean active,
            @Size(max = 20) String unit                                                       // optional: omitted = unchanged
    ) {}

    /** Result of a CSV import: new rows, changed rows, and the lines that were skipped (with the reason). */
    public record ImportResult(int created, int updated, java.util.List<String> skipped) {}

    public record PartResponse(
            Long id,
            String sku,
            String name,
            boolean active,
            String unit
    ) {
        public static PartResponse from(Part p) {
            return new PartResponse(p.getId(), p.getSku(), p.getName(), p.isActive(), p.getUnit());
        }
    }
}
