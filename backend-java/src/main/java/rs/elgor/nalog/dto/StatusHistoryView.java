package rs.elgor.nalog.dto;

import rs.elgor.nalog.domain.NalogStatus;
import rs.elgor.nalog.domain.NalogStatusHistory;

import java.time.Instant;

public record StatusHistoryView(NalogStatus fromStatus, NalogStatus toStatus, String changedByName, Instant changedAt) {
    public static StatusHistoryView from(NalogStatusHistory h) {
        return new StatusHistoryView(h.getFromStatus(), h.getToStatus(), h.getChangedByName(), h.getChangedAt());
    }
}
