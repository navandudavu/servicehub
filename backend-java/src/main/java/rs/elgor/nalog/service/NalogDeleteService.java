package rs.elgor.nalog.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.domain.Nalog;
import rs.elgor.nalog.domain.NalogStatus;
import rs.elgor.nalog.domain.StockMovement;
import rs.elgor.nalog.repo.NalogRepository;

/**
 * Deleting a nalog, admin only. Everything happens in ONE transaction:
 *  - the parts it still holds go back to stock, with ledger rows (a CANCELLED nalog already gave them back);
 *  - its photo rows go now and the image files after the commit, so a rollback never leaves a nalog without photos;
 *  - notes, status history and part lines go with it (database cascade);
 *  - one line in nalog_deleted_log keeps who deleted what and when.
 * COMPLETED nalozi are finished accounting documents and can never be deleted.
 */
@Service
public class NalogDeleteService {

    private static final Logger log = LoggerFactory.getLogger(NalogDeleteService.class);

    private final NalogRepository nalogRepository;
    private final NalogService nalogService;
    private final NalogPhotoService photoService;

    @PersistenceContext
    private EntityManager em;

    public NalogDeleteService(NalogRepository nalogRepository, NalogService nalogService, NalogPhotoService photoService) {
        this.nalogRepository = nalogRepository;
        this.nalogService = nalogService;
        this.photoService = photoService;
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id, AuthUser actor) {
        if (actor == null || !actor.isAdmin()) {
            throw NalogException.forbidden("Only an admin can delete a nalog");
        }
        Nalog nalog = nalogRepository.findByIdForUpdate(id)
                .orElseThrow(() -> NalogException.notFound("Nalog " + id + " not found"));
        if (nalog.getStatus() == NalogStatus.COMPLETED) {
            throw NalogException.conflict("A completed nalog cannot be deleted");
        }

        if (nalog.getStatus() != NalogStatus.CANCELLED) {
            nalogService.restoreStock(nalog, actor, StockMovement.Reason.NALOG_DELETE);
        }

        em.createNativeQuery("INSERT INTO nalog_deleted_log "
                        + "(nalog_id, nalog_number, status, customer_name, total, deleted_by_id, deleted_by_name) "
                        + "VALUES (:id, :number, :status, :customer, :total, :byId, :byName)")
                .setParameter("id", nalog.getId())
                .setParameter("number", nalog.getNalogNumber())
                .setParameter("status", nalog.getStatus().name())
                .setParameter("customer", nalog.getCustomer().getFullName())
                .setParameter("total", nalog.getTotal())
                .setParameter("byId", actor.id())
                .setParameter("byName", actor.name())
                .executeUpdate();

        photoService.removeAllFor(id);
        nalogRepository.delete(nalog);
        nalogRepository.flush();

        log.info("Nalog {} ({}) deleted by {}", nalog.getNalogNumber(), nalog.getStatus(), actor.name());
    }

    /**
     * Delete a selection, all or nothing: if any of them is COMPLETED (or has vanished) nothing is deleted.
     * Runs in ONE transaction; each nalog goes through the same single-delete path (stock back, log row, photos).
     */
    @Transactional(rollbackFor = Exception.class)
    public int deleteMany(java.util.List<Long> ids, AuthUser actor) {
        if (actor == null || !actor.isAdmin()) {
            throw NalogException.forbidden("Only an admin can delete a nalog");
        }
        java.util.List<Long> sorted = ids.stream().distinct().sorted().toList();   // same lock order every time
        java.util.List<Nalog> found = nalogRepository.findAllById(sorted);
        if (found.size() != sorted.size()) {
            throw NalogException.notFound("Neki izabrani nalozi više ne postoje. Ništa nije obrisano.");
        }
        java.util.List<String> completed = found.stream()
                .filter(n -> n.getStatus() == NalogStatus.COMPLETED)
                .map(Nalog::getNalogNumber).sorted().toList();
        if (!completed.isEmpty()) {
            throw NalogException.conflict("Završeni nalozi se ne mogu obrisati: " + String.join(", ", completed)
                    + ". Ništa nije obrisano.");
        }
        for (Long id : sorted) {
            delete(id, actor);
        }
        return sorted.size();
    }
}
