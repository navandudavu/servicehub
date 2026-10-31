package rs.elgor.nalog.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.dto.CalendarEntry;
import rs.elgor.nalog.dto.NalogStats;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;

/**
 * Read-only aggregates for the dashboard and the calendar. Plain SQL on purpose: group-bys and
 * FILTER sums are clearer (and testable in psql) than the JPA equivalents.
 *
 * Scope: an admin sees everything; a technician only nalozi assigned to or created by them,
 * the same rule as NalogService.requireAccess.
 */
@Service
public class NalogStatsService {

    private static final ZoneId ZONE = ZoneId.of("Europe/Belgrade");
    private static final String OPEN = "('DRAFT','DISPATCHED','IN_PROGRESS','AWAITING_PARTS')";
    // :admin = true -> the whole clause is true. No NULL parameters anywhere (untyped nulls are a classic JDBC trap).
    private static final String SCOPE = "(:admin OR n.assigned_to_id = :uid OR n.created_by_id = :uid)";

    @PersistenceContext
    private EntityManager em;

    @Transactional(readOnly = true)
    public NalogStats stats(AuthUser actor) {
        long uid = actor.isAdmin() ? 0L : actor.id();
        Timestamp weekStart = Timestamp.from(startOfWeek());

        long open = 0, awaiting = 0;
        List<NalogStats.StatusCount> byStatus = new ArrayList<>();
        for (Object[] r : rows(q("SELECT n.status, count(*) FROM nalog n WHERE " + SCOPE + " GROUP BY n.status ORDER BY n.status", uid))) {
            String status = (String) r[0];
            long c = ((Number) r[1]).longValue();
            byStatus.add(new NalogStats.StatusCount(status, c));
            if (isOpen(status)) open += c;
            if ("AWAITING_PARTS".equals(status)) awaiting = c;
        }

        long unassigned = ((Number) q("SELECT count(*) FROM nalog n WHERE " + SCOPE
                + " AND n.assigned_to_id IS NULL AND n.status IN " + OPEN, uid).getSingleResult()).longValue();

        long doneWeek = ((Number) q("SELECT count(*) FROM nalog n WHERE " + SCOPE
                + " AND n.status = 'COMPLETED' AND n.completed_at >= :week", uid)
                .setParameter("week", weekStart).getSingleResult()).longValue();

        List<NalogStats.TechCount> perTech = new ArrayList<>();
        List<NalogStats.TechHours> hours = new ArrayList<>();
        if (actor.isAdmin()) {
            for (Object[] r : rows(q("SELECT coalesce(n.assigned_to_name, '-') AS name, count(*) AS c FROM nalog n WHERE n.status IN "
                    + OPEN + " AND :admin GROUP BY 1 ORDER BY c DESC, name", uid))) {
                perTech.add(new NalogStats.TechCount((String) r[0], ((Number) r[1]).longValue()));
            }
            for (Object[] r : rows(q("SELECT coalesce(n.assigned_to_name, '-') AS name, "
                    + "coalesce(sum(n.labor_hours) FILTER (WHERE n.status = 'COMPLETED'), 0) AS total, "
                    + "coalesce(sum(n.labor_hours) FILTER (WHERE n.status = 'COMPLETED' AND n.completed_at >= :week), 0) AS wk "
                    + "FROM nalog n WHERE :admin GROUP BY 1 ORDER BY total DESC, name", uid)
                    .setParameter("week", weekStart))) {
                hours.add(new NalogStats.TechHours((String) r[0], dec(r[1]), dec(r[2])));
            }
        }
        return new NalogStats(open, unassigned, awaiting, doneWeek, byStatus, perTech, hours);
    }

    /** Nalozi with a planned visit in [from, to). Capped at 500 rows. */
    @Transactional(readOnly = true)
    public List<CalendarEntry> calendar(Instant from, Instant to, AuthUser actor) {
        if (from == null || to == null || !from.isBefore(to)) {
            throw NalogException.invalid("from and to are required and from must be before to");
        }
        if (java.time.Duration.between(from, to).toDays() > 62) {
            throw NalogException.invalid("The range may be at most 62 days");
        }
        long uid = actor.isAdmin() ? 0L : actor.id();
        Query q = q("SELECT n.id, n.nalog_number, n.status, n.scheduled_at, c.full_name, n.appliance_type, n.assigned_to_name "
                + "FROM nalog n JOIN customer c ON c.id = n.customer_id "
                + "WHERE " + SCOPE + " AND n.scheduled_at >= :from AND n.scheduled_at < :to "
                + "ORDER BY n.scheduled_at, n.id LIMIT 500", uid)
                .setParameter("from", Timestamp.from(from))
                .setParameter("to", Timestamp.from(to));
        List<CalendarEntry> out = new ArrayList<>();
        for (Object[] r : rows(q)) {
            out.add(new CalendarEntry(((Number) r[0]).longValue(), (String) r[1], (String) r[2],
                    ((java.sql.Timestamp) r[3]).toInstant(), (String) r[4], (String) r[5], (String) r[6]));
        }
        return out;
    }

    // ---- helpers -----------------------------------------------------------

    private Query q(String sql, long uid) {
        Query query = em.createNativeQuery(sql);
        if (sql.contains(":admin")) query.setParameter("admin", uid == 0L);
        if (sql.contains(":uid")) query.setParameter("uid", uid);
        return query;
    }

    @SuppressWarnings("unchecked")
    private static List<Object[]> rows(Query q) {
        return (List<Object[]>) q.getResultList();
    }

    private static boolean isOpen(String s) {
        return s.equals("DRAFT") || s.equals("DISPATCHED") || s.equals("IN_PROGRESS") || s.equals("AWAITING_PARTS");
    }

    private static BigDecimal dec(Object o) {
        return ((BigDecimal) o).setScale(2, RoundingMode.HALF_UP);
    }

    /** Monday 00:00 of the current week, Serbian time. */
    static Instant startOfWeek() {
        return ZonedDateTime.now(ZONE).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                .toLocalDate().atStartOfDay(ZONE).toInstant();
    }
}
