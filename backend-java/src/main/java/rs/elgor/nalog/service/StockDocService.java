package rs.elgor.nalog.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.domain.AppUser;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.domain.Part;
import rs.elgor.nalog.domain.StockDoc;
import rs.elgor.nalog.domain.StockDocLine;
import rs.elgor.nalog.dto.PageResponse;
import rs.elgor.nalog.dto.StockDocDtos.*;
import rs.elgor.nalog.repo.AppUserRepository;
import rs.elgor.nalog.repo.PartRepository;
import rs.elgor.nalog.repo.StockDocLineRepository;
import rs.elgor.nalog.repo.StockDocRepository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Zaduzenje / razduzenje: numbered documents. Only admin-level users write them (the controller enforces that),
 * a technician only ever reads his own. Documents are never deleted and never touch the Magacin stock numbers.
 */
@Service
public class StockDocService {

    private static final Instant EPOCH = Instant.EPOCH;
    private static final Instant FAR_FUTURE = Instant.parse("9999-01-01T00:00:00Z");

    private final StockDocRepository docs;
    private final StockDocLineRepository lines;
    private final PartRepository parts;
    private final AppUserRepository users;
    private final NalogEventService events;

    @PersistenceContext
    private EntityManager em;

    public StockDocService(StockDocRepository docs, StockDocLineRepository lines, PartRepository parts, AppUserRepository users,
                           NalogEventService events) {
        this.events = events;
        this.docs = docs;
        this.lines = lines;
        this.parts = parts;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public PageResponse<DocSummary> list(StockDoc.Type type, Long technicianId, Instant from, Instant to,
                                         int page, int size, AuthUser actor) {
        long tech = scope(technicianId, actor);
        var result = docs.search(type == null, type == null ? StockDoc.Type.ZAD : type, tech,
                from == null ? EPOCH : from, to == null ? FAR_FUTURE : to,
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100),
                        Sort.by(Sort.Direction.DESC, "docAt").and(Sort.by(Sort.Direction.DESC, "id"))));
        Map<Long, String> names = names(result.getContent().stream().map(StockDoc::getTechnicianId).toList());
        Map<Long, String> nalozi = nalogNumbers(result.getContent());
        return PageResponse.of(result.map(d -> new DocSummary(d.getId(), d.getType(), d.getDocNo(), d.getTechnicianId(),
                names.getOrDefault(d.getTechnicianId(), "?"), d.getDocAt(), d.getCreatedByName(), d.getLines().size(),
                d.getNalogId(), d.getNalogId() == null ? null : nalozi.get(d.getNalogId()))));
    }

    /** Complete documents with all their lines (for printing a technician's whole list / the full report), oldest first, at most 500. */
    @Transactional(readOnly = true)
    public List<DocView> full(StockDoc.Type type, Long technicianId, Instant from, Instant to, AuthUser actor) {
        long tech = scope(technicianId, actor);
        var result = docs.search(type == null, type == null ? StockDoc.Type.ZAD : type, tech,
                from == null ? EPOCH : from, to == null ? FAR_FUTURE : to,
                PageRequest.of(0, 500, Sort.by(Sort.Direction.ASC, "docAt").and(Sort.by(Sort.Direction.ASC, "id"))));
        return result.getContent().stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public DocView get(Long id, AuthUser actor) {
        StockDoc d = docs.findById(id).orElseThrow(() -> NalogException.notFound("Dokument ne postoji"));
        if (actor == null || (!actor.isAdmin() && d.getTechnicianId() != actor.id())) {
            throw NalogException.notFound("Dokument ne postoji");        // not yours = not there
        }
        return view(d);
    }

    @Transactional(rollbackFor = Exception.class)
    public DocView create(CreateRequest req, AuthUser actor) {
        requireAdmin(actor);
        requireTechnician(req.technicianId());
        StockDoc d = new StockDoc();
        d.setType(req.type());
        d.setDocNo(req.type() == StockDoc.Type.ZAD ? docs.nextZadNo() : docs.nextRazNo());
        d.setTechnicianId(req.technicianId());
        d.setDocAt(req.docAt() == null ? Instant.now() : req.docAt());
        d.setCreatedBy(actor.id());
        d.setCreatedByName(actor.name());
        fillLines(d, req.lines());
        lockTechnician(d.getTechnicianId());
        docs.saveAndFlush(d);
        requireNotNegative(List.of(d.getTechnicianId()));
        return view(d);
    }

    @Transactional(rollbackFor = Exception.class)
    public DocView update(Long id, UpdateRequest req, AuthUser actor) {
        requireAdmin(actor);
        StockDoc d = docs.findById(id).orElseThrow(() -> NalogException.notFound("Dokument ne postoji"));
        requireTechnician(req.technicianId());
        if (d.getNalogId() != null && d.getTechnicianId() != req.technicianId()) {
            throw NalogException.invalid("Razduženje iz naloga ne može da se prebaci na drugog servisera");
        }
        long oldTech = d.getTechnicianId();
        lockTechnician(Math.min(oldTech, req.technicianId()));
        lockTechnician(Math.max(oldTech, req.technicianId()));
        saveRevision(d, actor);                         // the version being replaced, kept for good
        d.setTechnicianId(req.technicianId());
        d.setDocAt(req.docAt());
        d.setUpdatedByName(actor.name());
        d.getLines().clear();
        docs.flush();                                   // orphan delete first, then the new lines
        fillLines(d, req.lines());
        docs.saveAndFlush(d);
        requireNotNegative(List.of(oldTech, d.getTechnicianId()));
        if (d.getNalogId() != null) {                   // the nalog's Materijal is this document: its timeline shows the change
            events.record(d.getNalogId(), actor, "MATERIAL", "Razduženje br. " + d.getDocNo() + " izmenjeno: "
                    + d.getLines().stream().map(l -> l.getName() + " x " + l.getQuantity().stripTrailingZeros().toPlainString())
                    .collect(Collectors.joining("; ")));
        }
        return view(d);
    }

    /** A technician can never be left with less than he was issued: no RAZ above the ZAD, no ZAD cut below what was used. */
    private void requireNotNegative(Collection<Long> technicianIds) {
        for (long tech : new TreeSet<>(technicianIds)) {
            Map<Long, BigDecimal> sum = new HashMap<>();
            Map<Long, String> name = new HashMap<>();
            for (StockDocLine l : lines.linesBefore(tech, FAR_FUTURE)) {
                if (l.getPartId() == null) {
                    continue;
                }
                sum.merge(l.getPartId(), l.getDoc().getType() == StockDoc.Type.ZAD ? l.getQuantity() : l.getQuantity().negate(), BigDecimal::add);
                name.put(l.getPartId(), l.getName());
            }
            sum.forEach((part, q) -> {
                if (q.signum() < 0) {
                    throw NalogException.invalid("Serviser nema dovoljno zaduženo: " + name.get(part));
                }
            });
        }
    }

    /**
     * Stanje materijala: per technician and part, opening (before {@code from}) + issued - returned in [from, to) = closing.
     * A technician only sees his own rows. Rows that are zero everywhere are left out.
     */
    @Transactional(readOnly = true)
    public List<BalanceRow> balance(Long technicianId, Long partId, Instant from, Instant to, AuthUser actor) {
        long tech = scope(technicianId, actor);
        Instant start = from == null ? EPOCH : from;
        Instant end = to == null ? FAR_FUTURE : to;

        record Acc(Long technicianId, Long partId, String sku, String name, String unit, Instant lastAt,
                   BigDecimal[] sums) {}
        Map<String, Acc> acc = new LinkedHashMap<>();
        for (StockDocLine l : lines.linesBefore(tech, end)) {
            if (partId != null && !partId.equals(l.getPartId())) {
                continue;
            }
            StockDoc d = l.getDoc();
            String key = d.getTechnicianId() + "|" + (l.getPartId() != null ? "p" + l.getPartId() : "n" + l.getName().toLowerCase());
            Acc a = acc.get(key);
            BigDecimal[] sums;
            if (a == null) {
                sums = new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO};
                a = new Acc(d.getTechnicianId(), l.getPartId(), l.getSku(), l.getName(), l.getUnit(), d.getDocAt(), sums);
            } else {
                sums = a.sums();
                if (d.getDocAt().isAfter(a.lastAt())) {          // show the newest snapshot of sku/name/unit
                    a = new Acc(a.technicianId(), a.partId(), l.getSku(), l.getName(), l.getUnit(), d.getDocAt(), sums);
                }
            }
            boolean zad = d.getType() == StockDoc.Type.ZAD;
            if (d.getDocAt().isBefore(start)) {
                sums[0] = zad ? sums[0].add(l.getQuantity()) : sums[0].subtract(l.getQuantity());
            } else if (zad) {
                sums[1] = sums[1].add(l.getQuantity());
            } else {
                sums[2] = sums[2].add(l.getQuantity());
            }
            acc.put(key, a);
        }
        Map<Long, String> names = names(acc.values().stream().map(Acc::technicianId).distinct().toList());
        return acc.values().stream()
                .map(a -> {
                    BigDecimal closing = a.sums()[0].add(a.sums()[1]).subtract(a.sums()[2]);
                    return new BalanceRow(a.technicianId(), names.getOrDefault(a.technicianId(), "?"), a.partId(), a.sku(), a.name(),
                            a.unit(), a.sums()[0], a.sums()[1], a.sums()[2], closing);
                })
                .filter(r -> r.opening().signum() != 0 || r.issued().signum() != 0 || r.returned().signum() != 0 || r.closing().signum() != 0)
                .sorted(Comparator.comparing(BalanceRow::technicianName, String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(BalanceRow::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    /** Previous versions of a document, newest first. Admin-level only. */
    @Transactional(readOnly = true)
    public List<RevisionView> revisions(Long id, AuthUser actor) {
        requireAdmin(actor);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("SELECT revised_at, revised_by_name, snapshot FROM stock_doc_revision "
                + "WHERE doc_id = :id ORDER BY revised_at DESC, id DESC").setParameter("id", id).getResultList();
        return rows.stream().map(r -> new RevisionView(DbTime.toInstant(r[0]), (String) r[1], (String) r[2])).toList();
    }

    void saveRevision(StockDoc d, AuthUser actor) {
        String items = d.getLines().stream()
                .map(l -> (l.getSku() == null ? "" : l.getSku() + " ") + l.getName() + " x " + l.getQuantity().toPlainString() + " " + l.getUnit())
                .collect(Collectors.joining("; "));
        String snapshot = names(List.of(d.getTechnicianId())).getOrDefault(d.getTechnicianId(), "?")
                + " | " + d.getDocAt() + " | " + items;
        em.createNativeQuery("INSERT INTO stock_doc_revision (doc_id, revised_by_name, snapshot) VALUES (:id, :by, :snap)")
                .setParameter("id", d.getId()).setParameter("by", actor.name()).setParameter("snap", snapshot).executeUpdate();
    }

    // ---- helpers ----

    /** Admin-level: the technician asked for (0 = everybody). Technician: always himself; asking for somebody else is a 403. */
    private static long scope(Long requested, AuthUser actor) {
        if (actor == null) {
            throw NalogException.forbidden("Permission denied");
        }
        if (!actor.isAdmin()) {
            if (requested != null && requested != actor.id()) {
                throw NalogException.forbidden("Permission denied");
            }
            return actor.id();
        }
        return requested == null ? 0L : requested;
    }

    private static void requireAdmin(AuthUser actor) {
        if (actor == null || !actor.isAdmin()) {
            throw NalogException.forbidden("Permission denied");
        }
    }

    private void requireTechnician(Long technicianId) {
        AppUser tech = users.findById(technicianId).orElseThrow(() -> NalogException.notFound("Serviser ne postoji"));
        if (!"technician".equalsIgnoreCase(tech.getRole())) {
            throw NalogException.invalid("Zaduženje se vodi samo za servisere");
        }
    }

    void fillLines(StockDoc d, List<LineRequest> reqs) {
        Map<Long, Part> byId = parts.findAllById(reqs.stream().map(LineRequest::partId).distinct().toList())
                .stream().collect(Collectors.toMap(Part::getId, p -> p));
        for (LineRequest r : reqs) {
            Part p = byId.get(r.partId());
            if (p == null) {
                throw NalogException.notFound("Deo " + r.partId() + " ne postoji");
            }
            StockDocLine l = new StockDocLine();
            l.setDoc(d);
            l.setPartId(p.getId());
            l.setSku(p.getSku());
            l.setName(p.getName());
            l.setUnit(p.getUnit());
            l.setQuantity(r.quantity().setScale(3, java.math.RoundingMode.HALF_UP));
            d.getLines().add(l);
        }
    }

    private Map<Long, String> names(Collection<Long> ids) {
        return users.findAllById(ids).stream().collect(Collectors.toMap(AppUser::getId, AppUser::getName));
    }

    private DocView view(StockDoc d) {
        return new DocView(d.getId(), d.getType(), d.getDocNo(), d.getTechnicianId(),
                names(List.of(d.getTechnicianId())).getOrDefault(d.getTechnicianId(), "?"), d.getDocAt(),
                d.getCreatedByName(), d.getUpdatedByName(), d.getLines().stream().map(LineView::from).toList(),
                d.getNalogId(), d.getNalogId() == null ? null : nalogNumbers(List.of(d)).get(d.getNalogId()));
    }

    /** nalog id -> number for the documents that came from a nalog (one query, not one per document). */
    private Map<Long, String> nalogNumbers(Collection<StockDoc> docs) {
        List<Long> ids = docs.stream().map(StockDoc::getNalogId).filter(Objects::nonNull).distinct().toList();
        Map<Long, String> out = new HashMap<>();
        if (ids.isEmpty()) {
            return out;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("SELECT id, nalog_number FROM nalog WHERE id IN (:ids)")
                .setParameter("ids", ids).getResultList();
        for (Object[] r : rows) {
            out.put(((Number) r[0]).longValue(), (String) r[1]);
        }
        return out;
    }

    /** What a technician holds right now: only parts with zaduzeno - razduzeno above zero. Quantities stay internal. */
    public record Held(Long partId, String sku, String name, String unit, BigDecimal quantity) {}

    @Transactional(readOnly = true)
    public List<Held> held(long technicianId) {
        Map<Long, Held> acc = new LinkedHashMap<>();
        for (StockDocLine l : lines.linesBefore(technicianId, FAR_FUTURE)) {
            if (l.getPartId() == null) {
                continue;
            }
            BigDecimal signed = l.getDoc().getType() == StockDoc.Type.ZAD ? l.getQuantity() : l.getQuantity().negate();
            acc.merge(l.getPartId(), new Held(l.getPartId(), l.getSku(), l.getName(), l.getUnit(), signed),
                    (a, b) -> new Held(a.partId(), b.sku(), b.name(), b.unit(), a.quantity().add(b.quantity())));
        }
        return acc.values().stream().filter(h -> h.quantity().signum() > 0)
                .sorted(Comparator.comparing(Held::name, String.CASE_INSENSITIVE_ORDER)).toList();
    }

    /** The parts list a technician sees in "Magacin" (also the picker of the nalog's Materijal): name, sku, unit - no quantity. */
    @Transactional(readOnly = true)
    public List<HeldPart> heldParts(Long technicianId, String q, AuthUser actor) {
        if (actor == null) {
            throw NalogException.forbidden("Permission denied");
        }
        long tech;
        if (actor.isAdmin()) {
            if (technicianId == null) {
                throw NalogException.invalid("Izaberite servisera");
            }
            tech = technicianId;
        } else {
            if (technicianId != null && technicianId != actor.id()) {
                throw NalogException.forbidden("Permission denied");
            }
            tech = actor.id();
        }
        String needle = q == null ? "" : q.trim().toLowerCase();
        return held(tech).stream()
                .filter(h -> needle.isEmpty() || h.name().toLowerCase().contains(needle)
                        || (h.sku() != null && h.sku().toLowerCase().contains(needle)))
                .map(h -> new HeldPart(h.partId(), h.sku(), h.name(), h.unit(), h.quantity())).toList();
    }

    /** Serialises material changes per technician, so two saves cannot both spend the same last piece. */
    void lockTechnician(long technicianId) {
        em.createNativeQuery("SELECT id FROM app_user WHERE id = :id FOR UPDATE").setParameter("id", technicianId).getResultList();
    }
}
