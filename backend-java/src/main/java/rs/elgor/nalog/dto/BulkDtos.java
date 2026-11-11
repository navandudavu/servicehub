package rs.elgor.nalog.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/** Bulk actions on a selection from the list screens (max 200 ids). Mirrored in frontend/src/types/nalog.ts. */
public final class BulkDtos {
    private BulkDtos() {}

    public record BulkIds(@NotEmpty @Size(max = 200) List<@NotNull Long> ids) {}

    /** technicianId null = un-assign. */
    public record BulkAssign(@NotEmpty @Size(max = 200) List<@NotNull Long> ids, Long technicianId) {}

    public record BulkActive(@NotEmpty @Size(max = 200) List<@NotNull Long> ids, boolean active) {}

    /** All-or-nothing actions (nalozi, parts): how many rows were changed. */
    public record BulkResult(int processed) {}

    /** Customers that still have nalozi are skipped, not failed: reason is a code the UI translates. */
    public record BulkCustomerDelete(int deleted, List<Skipped> skipped) {
        public record Skipped(long id, String fullName, String reason) {}
    }
}
