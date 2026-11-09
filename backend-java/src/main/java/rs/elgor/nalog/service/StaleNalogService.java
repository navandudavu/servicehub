package rs.elgor.nalog.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.dto.StaleNalogs;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * "Forgotten" nalozi: still DISPATCHED or IN_PROGRESS and not changed for nalog.stale.days days (default 2).
 * AWAITING_PARTS is left out on purpose (waiting for a part can take days); DRAFT is not work in progress.
 */
@Service
public class StaleNalogService {

    private static final int MAX_ITEMS = 100;
    private static final String WHERE = " FROM nalog n JOIN customer c ON c.id = n.customer_id "
            + "LEFT JOIN app_user u ON u.id = n.assigned_to_id "
            + "WHERE n.status IN ('DISPATCHED','IN_PROGRESS') AND n.updated_at < ?";

    private final JdbcTemplate jdbc;
    private final int days;

    public StaleNalogService(JdbcTemplate jdbc, @Value("${nalog.stale.days:2}") int days) {
        this.jdbc = jdbc;
        this.days = Math.max(1, days);
    }

    @Transactional(readOnly = true)
    public StaleNalogs list() {
        Instant now = Instant.now();
        Timestamp cutoff = Timestamp.from(now.minus(days, ChronoUnit.DAYS));
        Long total = jdbc.queryForObject("SELECT count(*)" + WHERE, Long.class, cutoff);
        List<StaleNalogs.Item> items = jdbc.query(
                "SELECT n.id, n.nalog_number, n.status, c.full_name, coalesce(u.name, n.assigned_to_name), n.updated_at"
              + WHERE + " ORDER BY n.updated_at, n.id LIMIT " + MAX_ITEMS,
                (rs, i) -> {
                    Instant updated = rs.getTimestamp(6).toInstant();
                    return new StaleNalogs.Item(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4),
                            rs.getString(5), updated, Duration.between(updated, now).toDays());
                }, cutoff);
        return new StaleNalogs(days, total == null ? 0 : total, items);
    }
}
