package rs.elgor.nalog.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.dto.ReportSummary;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Admin-only money reports and CSV export. Read-only; nothing here recalculates a price. */
@Service
public class NalogReportService {

    private static final ZoneId ZONE = ZoneId.of("Europe/Belgrade");
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd.MM.yyyy. HH:mm").withZone(ZONE);
    private static final int MAX_CSV_ROWS = 50_000;
    private static final Set<String> STATUSES =
            Set.of("DRAFT", "DISPATCHED", "IN_PROGRESS", "AWAITING_PARTS", "COMPLETED", "CANCELLED");

    private static final String SUMS =
            "count(*), coalesce(sum(n.labor_hours),0), coalesce(sum(n.labor_total),0), coalesce(sum(n.parts_total),0), "
          + "coalesce(sum(n.subtotal),0), coalesce(sum(n.vat_amount),0), coalesce(sum(n.total),0)";
    private static final String DONE_IN_RANGE =
            " FROM nalog n WHERE n.status = 'COMPLETED' AND n.completed_at >= :from AND n.completed_at < :to";

    @PersistenceContext
    private EntityManager em;

    @Transactional(readOnly = true)
    public ReportSummary summary(Instant from, Instant to) {
        checkRange(from, to);
        ReportSummary.Totals totals = totals((Object[]) range(em.createNativeQuery("SELECT " + SUMS + DONE_IN_RANGE), from, to).getSingleResult(), 0);
        return new ReportSummary(from, to, totals,
                grouped("coalesce(n.assigned_to_name, '-')", from, to, "total DESC, key"),
                grouped("to_char(n.completed_at AT TIME ZONE 'Europe/Belgrade', 'YYYY-MM')", from, to, "key"),
                grouped("n.payment_type", from, to, "key"));
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
              + "n.labor_hours, n.labor_total, n.parts_total, n.subtotal, n.vat_amount, n.total, n.payment_type "
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
                "Uređaj", "Marka", "Model", "Serviser", "Sati rada", "Rad", "Delovi", "Osnovica", "PDV", "Ukupno", "Plaćanje"))
          .append("\r\n");
        for (Object[] r : rows) {
            List<String> cells = new ArrayList<>(19);
            cells.add((String) r[0]);
            cells.add((String) r[1]);
            cells.add(when(r[2]));
            cells.add(when(r[3]));
            for (int i = 4; i <= 11; i++) cells.add((String) r[i]);
            for (int i = 12; i <= 17; i++) cells.add(money(r[i]));
            cells.add((String) r[18]);
            sb.append(cells.stream().map(NalogReportService::cell).reduce((a, b) -> a + ";" + b).orElse("")).append("\r\n");
        }
        return sb.toString();
    }

    // ---- helpers -----------------------------------------------------------

    private List<ReportSummary.Row> grouped(String keyExpr, Instant from, Instant to, String order) {
        Query q = em.createNativeQuery("SELECT " + keyExpr + " AS key, " + SUMS + DONE_IN_RANGE + " GROUP BY 1 ORDER BY " + order.replace("total DESC", "sum(n.total) DESC"));
        range(q, from, to);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        List<ReportSummary.Row> out = new ArrayList<>();
        for (Object[] r : rows) out.add(new ReportSummary.Row((String) r[0], totals(r, 1)));
        return out;
    }

    private static ReportSummary.Totals totals(Object[] r, int o) {
        return new ReportSummary.Totals(((Number) r[o]).longValue(), dec(r[o + 1]), dec(r[o + 2]), dec(r[o + 3]),
                dec(r[o + 4]), dec(r[o + 5]), dec(r[o + 6]));
    }

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

    private static BigDecimal dec(Object o) {
        return ((BigDecimal) o).setScale(2, RoundingMode.HALF_UP);
    }

    private static String money(Object o) {
        return o == null ? "" : ((BigDecimal) o).setScale(2, RoundingMode.HALF_UP).toPlainString().replace('.', ',');
    }

    private static String when(Object o) {
        return o == null ? "" : DATE_TIME.format(((Timestamp) o).toInstant());
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
