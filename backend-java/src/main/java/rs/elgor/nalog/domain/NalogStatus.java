package rs.elgor.nalog.domain;

/** Lifecycle of a nalog. Names MUST match chk_nalog_status in V1__nalog_core.sql. */
public enum NalogStatus {
    DRAFT,
    DISPATCHED,
    IN_PROGRESS,
    AWAITING_PARTS,
    COMPLETED,
    CANCELLED
}
