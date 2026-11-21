package rs.elgor.nalog.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.dto.NalogEventView;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Complete log of what happened to a nalog, and who used to work on it. Written inside the same transaction as the
 * change itself (REQUIRED), so a rolled-back change leaves no log line.
 */
@Service
public class NalogEventService {

    @PersistenceContext
    private EntityManager em;

    @Transactional
    public void record(Long nalogId, AuthUser actor, String kind, String detail) {
        em.createNativeQuery("INSERT INTO nalog_event (nalog_id, actor_id, actor_name, kind, detail) "
                        + "VALUES (:n, CAST(:aid AS BIGINT), CAST(:an AS VARCHAR), :k, CAST(:d AS VARCHAR))")
                .setParameter("n", nalogId)
                .setParameter("aid", actor == null ? null : actor.id())
                .setParameter("an", actor == null ? null : actor.name())
                .setParameter("k", kind)
                .setParameter("d", detail == null ? null : (detail.length() > 600 ? detail.substring(0, 600) : detail))
                .executeUpdate();
    }

    @Transactional
    public void addPastAssignee(Long nalogId, Long userId) {
        em.createNativeQuery("INSERT INTO nalog_past_assignee (nalog_id, user_id) VALUES (:n, :u) ON CONFLICT DO NOTHING")
                .setParameter("n", nalogId).setParameter("u", userId).executeUpdate();
    }

    @Transactional(readOnly = true)
    public boolean wasAssignee(Long nalogId, Long userId) {
        if (userId == null) {
            return false;
        }
        Number n = (Number) em.createNativeQuery("SELECT count(*) FROM nalog_past_assignee WHERE nalog_id = :n AND user_id = :u")
                .setParameter("n", nalogId).setParameter("u", userId).getSingleResult();
        return n.longValue() > 0;
    }

    @SuppressWarnings("unchecked")
    @Transactional(readOnly = true)
    public List<Long> pastNalogIds(long userId) {
        List<Number> ids = em.createNativeQuery("SELECT nalog_id FROM nalog_past_assignee WHERE user_id = :u")
                .setParameter("u", userId).getResultList();
        return ids.stream().map(Number::longValue).toList();
    }

    /** Status changes (older ones too, they live in nalog_status_history) merged with the other events, oldest first. */
    @Transactional(readOnly = true)
    public List<NalogEventView> timeline(Long nalogId) {
        List<NalogEventView> out = new ArrayList<>();
        @SuppressWarnings("unchecked")
        List<Object[]> hist = em.createNativeQuery("SELECT changed_at, changed_by_name, from_status, to_status "
                + "FROM nalog_status_history WHERE nalog_id = :n").setParameter("n", nalogId).getResultList();
        for (Object[] r : hist) {
            out.add(new NalogEventView(DbTime.toInstant(r[0]), (String) r[1], "STATUS",
                    (r[2] == null ? "" : r[2] + " -> ") + r[3]));
        }
        @SuppressWarnings("unchecked")
        List<Object[]> ev = em.createNativeQuery("SELECT happened_at, actor_name, kind, detail FROM nalog_event "
                + "WHERE nalog_id = :n").setParameter("n", nalogId).getResultList();
        for (Object[] r : ev) {
            out.add(new NalogEventView(DbTime.toInstant(r[0]), (String) r[1], (String) r[2], (String) r[3]));
        }
        out.sort(Comparator.comparing(NalogEventView::at));
        return out;
    }
}
