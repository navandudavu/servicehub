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
 *   DRAFT -> DISPATCHED -> any working status
 *   working status <-> any other working status      (IN_PROGRESS, AWAITING_PARTS, RECEIVED, TESTING, DRIVING, NEEDS_ELECTRICIAN)
 *   working status -> COMPLETED
 *   (any non-terminal) -> CANCELLED   (admin only, restores stock)
 */
public final class NalogStatusRules {

    /** Statuses a technician moves between while the job is going on. */
    public static final Set<NalogStatus> WORKING = EnumSet.of(IN_PROGRESS, AWAITING_PARTS, RECEIVED, TESTING, DRIVING, NEEDS_ELECTRICIAN);

    private static final Map<NalogStatus, Set<NalogStatus>> ALLOWED = new EnumMap<>(NalogStatus.class);

    static {
        ALLOWED.put(DRAFT, EnumSet.of(DISPATCHED, CANCELLED));
        Set<NalogStatus> fromDispatched = EnumSet.copyOf(WORKING);
        fromDispatched.add(CANCELLED);
        ALLOWED.put(DISPATCHED, fromDispatched);
        for (NalogStatus w : WORKING) {
            Set<NalogStatus> to = EnumSet.copyOf(WORKING);
            to.remove(w);
            to.add(COMPLETED);
            to.add(CANCELLED);
            ALLOWED.put(w, to);
        }
        ALLOWED.put(COMPLETED, EnumSet.noneOf(NalogStatus.class));
        ALLOWED.put(CANCELLED, EnumSet.noneOf(NalogStatus.class));
    }

    private NalogStatusRules() {}

    public static boolean canMove(NalogStatus from, NalogStatus to) {
        return ALLOWED.get(from).contains(to);
    }

    public static Set<NalogStatus> next(NalogStatus from) {
        return ALLOWED.get(from);
    }
}
