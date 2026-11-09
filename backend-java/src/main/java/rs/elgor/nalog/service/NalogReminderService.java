package rs.elgor.nalog.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Evening reminder to technicians who still have nalozi IN_PROGRESS: "close them, but only if really finished".
 *
 * It only reminds. It never changes a nalog, because COMPLETED locks the nalog and fixes its hours, parts and price.
 * Time and days come from nalog.reminder.cron / nalog.reminder.zone (default 22:00, Monday to Saturday, Belgrade time).
 * Best effort: a failed push is only logged (PushSender never throws), so this can never break anything else.
 */
@Service
public class NalogReminderService {

    private static final Logger log = LoggerFactory.getLogger(NalogReminderService.class);

    private final JdbcTemplate jdbc;
    private final PushSender sender;
    private final boolean enabled;

    public NalogReminderService(JdbcTemplate jdbc, PushSender sender,
                                @Value("${nalog.reminder.enabled:true}") boolean enabled) {
        this.jdbc = jdbc;
        this.sender = sender;
        this.enabled = enabled;
    }

    @Scheduled(cron = "${nalog.reminder.cron:0 0 22 * * MON-SAT}", zone = "${nalog.reminder.zone:Europe/Belgrade}")
    public void scheduledRun() {
        if (!enabled) {
            return;
        }
        try {
            int sent = sendReminders();
            log.info("Nalog reminder: {} technician(s) notified", sent);
        } catch (Exception e) {
            log.warn("Nalog reminder failed: {}", e.toString());
        }
    }

    /** One push per active technician with at least one IN_PROGRESS nalog. Returns how many technicians were notified. */
    public int sendReminders() {
        List<long[]> rows = jdbc.query(
                "SELECT n.assigned_to_id, count(*) FROM nalog n JOIN app_user u ON u.id = n.assigned_to_id "
              + "WHERE n.status = 'IN_PROGRESS' AND u.role = 'technician' AND u.active "
              + "GROUP BY n.assigned_to_id",
                (rs, i) -> new long[]{rs.getLong(1), rs.getLong(2)});
        for (long[] r : rows) {
            sender.sendToUser(r[0], "Podsetnik: otvoreni nalozi",
                    "Imate otvorenih naloga: " + r[1] + ". Zatvorite nalog samo ako je posao zaista završen.",
                    Map.of("type", "nalog_reminder"));
        }
        return rows.size();
    }
}
