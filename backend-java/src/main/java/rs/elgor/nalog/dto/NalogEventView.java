package rs.elgor.nalog.dto;

import java.time.Instant;

/** One line of a nalog's timeline: a status change or any other recorded change. Mirrored in frontend/src/types/nalog.ts. */
public record NalogEventView(Instant at, String by, String kind, String detail) {}
