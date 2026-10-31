package rs.elgor.nalog.service;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/**
 * Native queries return timestamptz columns as different Java types depending on the Hibernate/driver
 * version (Instant, OffsetDateTime, java.sql.Timestamp...). Convert whatever arrives, never cast blindly.
 */
final class DbTime {
    private DbTime() {}

    static Instant toInstant(Object o) {
        if (o == null) return null;
        if (o instanceof Instant i) return i;
        if (o instanceof OffsetDateTime odt) return odt.toInstant();
        if (o instanceof java.time.ZonedDateTime z) return z.toInstant();
        if (o instanceof Timestamp t) return t.toInstant();
        if (o instanceof java.util.Date d) return Instant.ofEpochMilli(d.getTime());
        if (o instanceof LocalDateTime l) return l.toInstant(ZoneOffset.UTC);   // session time zone is UTC (jdbc.time_zone)
        throw new IllegalStateException("Unexpected timestamp type: " + o.getClass().getName());
    }
}
