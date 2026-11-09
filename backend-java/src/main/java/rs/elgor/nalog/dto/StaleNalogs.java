package rs.elgor.nalog.dto;

import java.time.Instant;
import java.util.List;

/** Open nalozi (DISPATCHED / IN_PROGRESS) nobody has touched for `days` days. `items` is capped, `total` is not. */
public record StaleNalogs(int days, long total, List<Item> items) {
    public record Item(long id, String nalogNumber, String status, String customerName, String technicianName,
                       Instant lastUpdate, long idleDays) {}
}
