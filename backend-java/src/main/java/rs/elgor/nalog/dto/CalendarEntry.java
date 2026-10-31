package rs.elgor.nalog.dto;

import java.time.Instant;

public record CalendarEntry(Long id, String nalogNumber, String status, Instant scheduledAt,
                            String customerName, String applianceType, String assignedToName) {}
