package rs.elgor.nalog.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.dto.CountsReport;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Owner-only reports (counts per worker and status) and CSV export. No money figures: revenue and payment-type reports were dropped. */
@Service
public class NalogReportService {

    private static final ZoneId ZONE = ZoneId.of("Europe/Belgrade");
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd.MM.yyyy. HH:mm").withZone(ZONE);
    private static final int MAX_CSV_ROWS = 50_000;
    private static final Set<String> STATUSES =
            Set.of("DRAFT", "DISPATCHED", "IN_PROGRESS", "AWAITING_PARTS", "RECEIVED", "TESTING", "DRIVING", "NEEDS_ELECTRICIAN", "COMPLETED", "CANCELLED");

    @PersistenceContext
    private EntityManager em;

    /** Nalozi created in [from, to) counted per worker and status. */
    @Transactional(readOnly = true)
    public CountsReport counts(Instant from, Instant to) {
        checkRange(from, to);
        Query q = em.createNativeQuery("SELECT coalesce(n.assigned_to_name, '-'), n.status, count(*) FROM nalog n "
                + "WHERE n.created_at >= :from AND n.created_at < :to GROUP BY 1, 2 ORDER BY 1, 2");
        range(q, from, to);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        Map<String, Map<String, Long>> perWorker = new LinkedHashMap<>();
        Map<String, Long> all = new LinkedHashMap<>();
        for (Object[] r : rows) {
            long n = ((Number) r[2]).longValue();
            perWorker.computeIfAbsent((String) r[0], k -> new LinkedHashMap<>()).merge((String) r[1], n, Long::sum);
            all.merge((String) r[1], n, Long::sum);
        }
        List<CountsReport.Row> out = new ArrayList<>();
        perWorker.forEach((w, m) -> out.add(new CountsReport.Row(w, m, m.values().stream().mapToLong(Long::longValue).sum())));
        return new CountsReport(from, to, out,
                new CountsReport.Row("", all, all.values().stream().mapToLong(Long::longValue).sum()));
    }

    /** One CSV row per nalog created in [from, to), optionally one status. Semicolon + decimal comma = opens correctly in Serbian Excel. */
    @Transactional(readOnly = true)
    public String csv(Instant from, Instant to, String status) {
        checkRange(from, to);
        if (status != null && !status.isBlank() && !STATUSES.contains(status)) {
            throw NalogException.invalid("Unknown status");
        }
        boolean byStatus = status != null && !status.isBlank();
        Query q = em.createNativeQuery(
                "SELECT n.nalog_number, n.status, n.created_at, n.completed_at, c.full_name, c.phone, c.address, c.city, "
              + "n.appliance_type, n.appliance_brand, n.appliance_model, n.assigned_to_name, "
              + "n.labor_hours "
              + "FROM nalog n JOIN customer c ON c.id = n.customer_id "
              + "WHERE n.created_at >= :from AND n.created_at < :to" + (byStatus ? " AND n.status = :status" : "")
              + " ORDER BY n.created_at, n.id LIMIT " + (MAX_CSV_ROWS + 1));
        range(q, from, to);
        if (byStatus) q.setParameter("status", status);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        if (rows.size() > MAX_CSV_ROWS) {
            throw NalogException.invalid("Too many rows (more than " + MAX_CSV_ROWS + "): choose a shorter period");
        }

        StringBuilder sb = new StringBuilder("﻿");        // BOM so Excel reads UTF-8 (č, ć, š, ž)
        sb.append(String.join(";", "Broj naloga", "Status", "Kreiran", "Završen", "Klijent", "Telefon", "Adresa", "Grad",
                "Uređaj", "Marka", "Model", "Serviser", "Sati rada"))
          .append("\r\n");
        for (Object[] r : rows) {
            List<String> cells = new ArrayList<>(13);
            cells.add((String) r[0]);
            cells.add((String) r[1]);
            cells.add(when(r[2]));
            cells.add(when(r[3]));
            for (int i = 4; i <= 11; i++) cells.add((String) r[i]);
            cells.add(money(r[12]));
            sb.append(cells.stream().map(NalogReportService::cell).reduce((a, b) -> a + ";" + b).orElse("")).append("\r\n");
        }
        return sb.toString();
    }

    // ---- helpers -----------------------------------------------------------

    private static Query range(Query q, Instant from, Instant to) {
        return q.setParameter("from", Timestamp.from(from)).setParameter("to", Timestamp.from(to));
    }

    private static void checkRange(Instant from, Instant to) {
        if (from == null || to == null || !from.isBefore(to)) {
            throw NalogException.invalid("from and to are required and from must be before to");
        }
        if (Duration.between(from, to).toDays() > 800) {
            throw NalogException.invalid("The period may be at most about two years");
        }
    }

    private static String money(Object o) {
        return o == null ? "" : ((BigDecimal) o).setScale(2, RoundingMode.HALF_UP).toPlainString().replace('.', ',');
    }

    private static String when(Object o) {
        return o == null ? "" : DATE_TIME.format(DbTime.toInstant(o));
    }

    /**
     * CSV cell: quoted when it holds ; " or a line break, and neutralised against spreadsheet formula
     * injection (a customer named "=HYPERLINK(...)" must not run when the accountant opens the file).
     */
    static String cell(String v) {
        if (v == null || v.isEmpty()) return "";
        String s = v;
        char c = s.charAt(0);
        boolean formula = c == '=' || c == '@' || c == '\t' || c == '\r'
                || ((c == '+' || c == '-') && (s.length() < 2 || !Character.isDigit(s.charAt(1)) && s.charAt(1) != ' '));
        if (formula) s = "'" + s;
        if (s.contains(";") || s.contains("\"") || s.contains("\n") || s.contains("\r")) {
            s = "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }
}
