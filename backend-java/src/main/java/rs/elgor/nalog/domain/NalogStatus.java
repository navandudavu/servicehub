package rs.elgor.nalog.domain;

/** Lifecycle of a nalog. Names MUST match chk_nalog_status in V1__nalog_core.sql. */
public enum NalogStatus {
    DRAFT,
    DISPATCHED,
    IN_PROGRESS,
    AWAITING_PARTS,
    RECEIVED,            // Preuzet u servis (a revers is printed)
    TESTING,             // Testira se
    DRIVING,             // Vozi se
    NEEDS_ELECTRICIAN,   // Potreban elektronicar
    COMPLETED,
    CANCELLED
}
