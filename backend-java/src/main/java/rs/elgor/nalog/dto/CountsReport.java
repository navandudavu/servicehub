package rs.elgor.nalog.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** How many nalozi each worker has, by status, among those created in [from, to). Counts only, no money. */
public record CountsReport(Instant from, Instant to, List<Row> rows, Row totals) {

    /** technician = worker name ("-" = unassigned); byStatus holds only the statuses that occur. */
    public record Row(String technician, Map<String, Long> byStatus, long total) {}
}
