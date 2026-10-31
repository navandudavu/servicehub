package rs.elgor.nalog.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.util.List;

/** Dashboard numbers. Hours are strings ("12.50"), like every other decimal in this API. */
public record NalogStats(
        long open,                 // DRAFT + DISPATCHED + IN_PROGRESS + AWAITING_PARTS
        long unassigned,           // open and nobody assigned
        long awaitingParts,
        long completedThisWeek,
        List<StatusCount> byStatus,
        List<TechCount> openByTechnician,     // admin only (empty for technicians)
        List<TechHours> hoursByTechnician     // admin only (empty for technicians)
) {
    public record StatusCount(String status, long count) {}

    public record TechCount(String name, long count) {}

    public record TechHours(String name,
                            @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal totalHours,
                            @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal hoursThisWeek) {}
}
