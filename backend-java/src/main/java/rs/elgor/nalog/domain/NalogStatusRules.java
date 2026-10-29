package rs.elgor.nalog.domain;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import static rs.elgor.nalog.domain.NalogStatus.*;

/**
 * The state machine. One table, one place. COMPLETED and CANCELLED are terminal:
 * a finished nalog is an accounting document and is never silently reopened.
 *
 *   DRAFT -> DISPATCHED -> IN_PROGRESS <-> AWAITING_PARTS
 *                              |
 *                              +-> COMPLETED
 *   (any non-terminal) -> CANCELLED   (admin only, restores stock)
 */
public final class NalogStatusRules {

    private static final Map<NalogStatus, Set<NalogStatus>> ALLOWED = new EnumMap<>(NalogStatus.class);

    static {
        ALLOWED.put(DRAFT,          EnumSet.of(DISPATCHED, CANCELLED));
        ALLOWED.put(DISPATCHED,     EnumSet.of(IN_PROGRESS, CANCELLED));
        ALLOWED.put(IN_PROGRESS,    EnumSet.of(AWAITING_PARTS, COMPLETED, CANCELLED));
        ALLOWED.put(AWAITING_PARTS, EnumSet.of(IN_PROGRESS, CANCELLED));
        ALLOWED.put(COMPLETED,      EnumSet.noneOf(NalogStatus.class));
        ALLOWED.put(CANCELLED,      EnumSet.noneOf(NalogStatus.class));
    }

    private NalogStatusRules() {}

    public static boolean canMove(NalogStatus from, NalogStatus to) {
        return ALLOWED.get(from).contains(to);
    }

    public static Set<NalogStatus> next(NalogStatus from) {
        return ALLOWED.get(from);
    }
}
