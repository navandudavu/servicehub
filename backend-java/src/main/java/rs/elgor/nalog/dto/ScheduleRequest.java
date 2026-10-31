package rs.elgor.nalog.dto;

import java.time.Instant;

/** {"scheduledAt": "2026-11-02T08:30:00Z"} sets the visit, {"scheduledAt": null} clears it. */
public record ScheduleRequest(Instant scheduledAt) {}
