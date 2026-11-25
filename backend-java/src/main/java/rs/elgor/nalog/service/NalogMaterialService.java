package rs.elgor.nalog.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.domain.Nalog;
import rs.elgor.nalog.domain.NalogStatus;
import rs.elgor.nalog.domain.StockDoc;
import rs.elgor.nalog.domain.StockDocLine;
import rs.elgor.nalog.dto.StockDocDtos.LineRequest;
import rs.elgor.nalog.dto.StockDocDtos.MaterialLine;
import rs.elgor.nalog.dto.StockDocDtos.MaterialRequest;
import rs.elgor.nalog.repo.StockDocRepository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.*;

/**
 * "Materijal" on a nalog. Using material is ALWAYS a Razduzenje of the technician the nalog is assigned to: saving
 * material creates one numbered RAZ document linked to the nalog. A technician can only ADD, and only parts he holds
 * (zaduzeno - razduzeno), never more than he holds. Changing or removing a line is for admin-level users; every
 * change keeps the previous version of the document (stock_doc_revision). Documents are never deleted.
 */
@Service
public class NalogMaterialService {

    private final NalogService nalogService;
    private final StockDocService stock;
    private final StockDocRepository docs;
    private final NalogEventService events;

    @PersistenceContext
    private EntityManager em;

    public NalogMaterialService(NalogService nalogService, StockDocService stock, StockDocRepository docs, NalogEventService events) {
        this.nalogService = nalogService;
        this.stock = stock;
        this.docs = docs;
        this.events = events;
    }

    /** Readable by everybody who may read the nalog (the archive included). */
    @Transactional(readOnly = true)
    public List<MaterialLine> list(Long nalogId, AuthUser actor) {
        requireMaterialAccess(actor);
        nalogService.loadReadable(nalogId, actor);
        return lines(nalogId);
    }

    @Transactional(rollbackFor = Exception.class)
    public List<MaterialLine> add(Long nalogId, MaterialRequest req, AuthUser actor) {
        requireMaterialAccess(actor);
        Nalog nalog = nalogService.loadAccessible(nalogId, actor);
        requireOpen(nalog, actor);
        Long techId = nalog.getAssignedToId();
        if (techId == null) {
            throw NalogException.conflict("Nalog nije dodeljen serviseru");
        }
        stock.lockTechnician(techId);

        Map<Long, BigDecimal> wanted = new LinkedHashMap<>();
        for (LineRequest r : req.lines()) {
            wanted.merge(r.partId(), r.quantity(), BigDecimal::add);
        }
        Map<Long, StockDocService.Held> held = new HashMap<>();
        stock.held(techId).forEach(h -> held.put(h.partId(), h));
        for (Map.Entry<Long, BigDecimal> e : wanted.entrySet()) {
            StockDocService.Held h = held.get(e.getKey());
            if (h == null) {
                throw NalogException.invalid("Deo nije u zaduženju servisera");
            }
            if (e.getValue().compareTo(h.quantity()) > 0) {
                throw NalogException.invalid("Količina je veća od zaduženja: " + h.name());
            }
        }

        StockDoc d = new StockDoc();
        d.setType(StockDoc.Type.RAZ);
        d.setDocNo(docs.nextRazNo());
        d.setTechnicianId(techId);
        d.setDocAt(Instant.now());
        d.setCreatedBy(actor.id());
        d.setCreatedByName(actor.name());
        d.setNalogId(nalogId);
        stock.fillLines(d, req.lines());
        docs.saveAndFlush(d);
        events.record(nalogId, actor, "MATERIAL", "Razduženje br. " + d.getDocNo() + ": " + describe(d.getLines()));
        return lines(nalogId);
    }

    /** Admin-level only. */
    @Transactional(rollbackFor = Exception.class)
    public List<MaterialLine> changeQuantity(Long nalogId, Long lineId, BigDecimal quantity, AuthUser actor) {
        requireAdmin(actor);
        Nalog nalog = nalogService.loadAccessible(nalogId, actor);
        requireOpen(nalog, actor);
        StockDocLine line = linkedLine(nalogId, lineId);
        StockDoc d = line.getDoc();
        stock.lockTechnician(d.getTechnicianId());
        BigDecimal q = quantity.setScale(3, RoundingMode.HALF_UP);
        BigDecimal more = q.subtract(line.getQuantity());
        if (more.signum() > 0) {
            BigDecimal have = stock.held(d.getTechnicianId()).stream()
                    .filter(h -> h.partId().equals(line.getPartId())).map(StockDocService.Held::quantity)
                    .findFirst().orElse(BigDecimal.ZERO);
            if (more.compareTo(have) > 0) {
                throw NalogException.invalid("Količina je veća od zaduženja: " + line.getName());
            }
        }
        stock.saveRevision(d, actor);
        String before = line.getQuantity().toPlainString();
        line.setQuantity(q);
        d.setUpdatedByName(actor.name());
        docs.saveAndFlush(d);
        events.record(nalogId, actor, "MATERIAL", "Izmena (razduženje br. " + d.getDocNo() + "): " + line.getName()
                + " " + before + " -> " + q.toPlainString() + " " + line.getUnit());
        return lines(nalogId);
    }

    /** Admin-level only. The document itself stays (never deleted); its previous version is kept. */
    @Transactional(rollbackFor = Exception.class)
    public List<MaterialLine> remove(Long nalogId, Long lineId, AuthUser actor) {
        requireAdmin(actor);
        Nalog nalog = nalogService.loadAccessible(nalogId, actor);
        requireOpen(nalog, actor);
        StockDocLine line = linkedLine(nalogId, lineId);
        StockDoc d = line.getDoc();
        stock.saveRevision(d, actor);
        d.getLines().remove(line);
        d.setUpdatedByName(actor.name());
        docs.saveAndFlush(d);
        events.record(nalogId, actor, "MATERIAL", "Uklonjeno (razduženje br. " + d.getDocNo() + "): " + line.getName()
                + " " + line.getQuantity().toPlainString() + " " + line.getUnit());
        return lines(nalogId);
    }

    // ---- helpers ----

    private List<MaterialLine> lines(Long nalogId) {
        List<MaterialLine> out = new ArrayList<>();
        for (StockDoc d : docs.findByNalogIdOrderByDocAtAscIdAsc(nalogId)) {
            for (StockDocLine l : d.getLines()) {
                out.add(new MaterialLine(l.getId(), d.getId(), d.getDocNo(), l.getPartId(), l.getSku(), l.getName(),
                        l.getUnit(), l.getQuantity(), d.getCreatedByName(), d.getDocAt()));
            }
        }
        return out;
    }

    private StockDocLine linkedLine(Long nalogId, Long lineId) {
        StockDocLine line = em.find(StockDocLine.class, lineId);
        if (line == null || !Objects.equals(line.getDoc().getNalogId(), nalogId) || line.getDoc().getType() != StockDoc.Type.RAZ) {
            throw NalogException.notFound("Stavka materijala ne postoji");
        }
        return line;
    }

    /** Finished and cancelled nalozi are closed for everybody: they can only be printed. */
    private static void requireOpen(Nalog nalog, AuthUser actor) {
        NalogStatus s = nalog.getStatus();
        boolean closed = s == NalogStatus.COMPLETED || s == NalogStatus.CANCELLED;
        if (closed) {
            throw NalogException.conflict("Materijal se ne može menjati na " + (s == NalogStatus.COMPLETED ? "završenom" : "otkazanom") + " nalogu");
        }
    }

    private static void requireAdmin(AuthUser actor) {
        if (actor == null || !actor.isOwner()) {
            throw NalogException.forbidden("Samo administrator menja materijal");
        }
    }

    /** Materijal belongs to the admin and the technician of the nalog; a manager has no access to it. */
    private static void requireMaterialAccess(AuthUser actor) {
        if (actor == null || (actor.isAdmin() && !actor.isOwner())) {
            throw NalogException.forbidden("Menadžer nema pristup materijalu");
        }
    }

    private static String describe(List<StockDocLine> lines) {
        StringBuilder sb = new StringBuilder();
        for (StockDocLine l : lines) {
            if (sb.length() > 0) {
                sb.append("; ");
            }
            sb.append(l.getName()).append(" x ").append(l.getQuantity().toPlainString()).append(' ').append(l.getUnit());
        }
        return sb.toString();
    }
}
