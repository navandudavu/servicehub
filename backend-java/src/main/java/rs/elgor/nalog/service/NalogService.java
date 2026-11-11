package rs.elgor.nalog.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.domain.*;
import rs.elgor.nalog.dto.*;
import rs.elgor.nalog.repo.*;

import java.time.Instant;
import java.time.Year;
import java.util.*;

@Service
public class NalogService {

    private static final Logger log = LoggerFactory.getLogger(NalogService.class);

    private final NalogRepository nalogRepository;
    private final CustomerRepository customerRepository;
    private final PartRepository partRepository;
    private final NalogStatusHistoryRepository historyRepository;
    private final StockMovementRepository movementRepository;
    private final AppUserRepository userRepository;
    private final PricingCalculator pricing;
    private final NalogPushNotifier pushNotifier;
    private final NalogPhotoRepository photoRepository;

    @PersistenceContext
    private EntityManager em;

    public NalogService(NalogRepository nalogRepository,
                        CustomerRepository customerRepository,
                        PartRepository partRepository,
                        NalogStatusHistoryRepository historyRepository,
                        StockMovementRepository movementRepository,
                        AppUserRepository userRepository,
                        PricingCalculator pricing,
                        NalogPushNotifier pushNotifier,
                        NalogPhotoRepository photoRepository) {
        this.nalogRepository = nalogRepository;
        this.customerRepository = customerRepository;
        this.partRepository = partRepository;
        this.historyRepository = historyRepository;
        this.movementRepository = movementRepository;
        this.userRepository = userRepository;
        this.pricing = pricing;
        this.pushNotifier = pushNotifier;
        this.photoRepository = photoRepository;
    }

    // ========================================================================
    // CREATE
    // ========================================================================

    /**
     * RULE B. ONE database transaction covers: (optional) customer insert, part stock
     * decrement + ledger rows, nalog insert, part-line inserts, status history.
     * Any exception - validation, out of stock, DB constraint, timeout - rolls ALL of it
     * back. There is no state where stock was reduced but the nalog doesn't exist.
     *
     * rollbackFor = Exception.class: Spring only rolls back on unchecked exceptions by
     * default; this makes checked ones safe too.
     */
    @Transactional(rollbackFor = Exception.class)
    public NalogResponse create(CreateNalogRequest req, String idempotencyKey, AuthUser actor) {

        // 0. Only admins make nalozi; technicians work the ones they are given.
        if (actor != null && !actor.isAdmin()) {
            throw NalogException.forbidden("Samo administrator može da napravi radni nalog");
        }

        // 1. Idempotent replay: same key => return the original, create nothing.
        if (idempotencyKey != null) {
            Optional<Nalog> existing = nalogRepository.findByIdempotencyKey(idempotencyKey);
            if (existing.isPresent()) {
                requireAccess(existing.get(), actor);
                log.info("Idempotent replay for key {} -> nalog {}", idempotencyKey, existing.get().getNalogNumber());
                return NalogResponse.from(existing.get());
            }
        }

        // 2. Status gate: a brand-new nalog can only start as DRAFT or DISPATCHED.
        NalogStatus status = req.status() == null ? NalogStatus.DRAFT : req.status();
        if (status != NalogStatus.DRAFT && status != NalogStatus.DISPATCHED) {
            throw NalogException.invalid("A new nalog can only be created as DRAFT or DISPATCHED, not " + status);
        }

        // 2b. Who is it assigned to? Technicians can only assign to themselves.
        AppUser assignee = resolveAssignee(req.assignedToId(), actor);

        // 3. Customer: reuse an existing one OR create one in this same transaction.
        Customer customer = resolveCustomer(req);

        // 4. Parts: merge duplicates, lock rows, validate stock, snapshot prices, decrement.
        Nalog nalog = new Nalog();
        List<NalogPartLine> lines = buildLines(req.partLines(), true, null);
        lines.forEach(nalog::addPartLine);

        // 5. Money. Computed here, in Java, with BigDecimal + HALF_UP (RULE A).
        PricingCalculator.Totals t = pricing.calculate(req.laborHours(), toPriceLines(lines));

        // 6. Assemble.
        nalog.setNalogNumber(nextNalogNumber());
        nalog.setIdempotencyKey(idempotencyKey);
        nalog.setCustomer(customer);
        nalog.setApplianceType(req.appliance().type());
        nalog.setApplianceBrand(req.appliance().brand().trim());
        nalog.setApplianceModel(blankToNull(req.appliance().model()));
        nalog.setSerialNumber(blankToNull(req.appliance().serialNumber()));
        nalog.setDiagnosis(req.diagnosis().trim());
        nalog.setLaborHours(req.laborHours());
        nalog.setLaborRate(t.laborRate());
        nalog.setLaborTotal(t.laborTotal());
        nalog.setPartsTotal(t.partsTotal());
        nalog.setSubtotal(t.subtotal());
        nalog.setVatRate(t.vatRate());
        nalog.setVatAmount(t.vatAmount());
        nalog.setTotal(t.total());
        nalog.setPaymentType(req.paymentType());
        nalog.setStatus(status);
        nalog.setScheduledAt(req.scheduledAt());
        if (assignee != null) {
            nalog.setAssignedToId(assignee.getId());
            nalog.setAssignedToName(assignee.getName());
        }
        if (actor != null) {
            nalog.setCreatedById(actor.id());
            nalog.setCreatedByName(actor.name());
        }

        // saveAndFlush: constraint violations surface HERE, inside the transaction.
        Nalog saved = nalogRepository.saveAndFlush(nalog);

        // Tell the technician (not when they assigned it to themselves). Sent only after commit.
        if (assignee != null && (actor == null || !Objects.equals(assignee.getId(), actor.id()))) {
            pushNotifier.notifyAssigned(assignee.getId(), saved.getId(), saved.getNalogNumber());
        }

        // 7. Audit rows - same transaction, so they exist if and only if the nalog does.
        for (NalogPartLine l : saved.getPartLines()) {
            movementRepository.save(StockMovement.of(l.getPart().getId(), -l.getQuantity(),
                    StockMovement.Reason.NALOG_CREATE, saved.getId(), actor, saved.getNalogNumber()));
        }
        recordHistory(saved.getId(), null, status, actor);

        log.info("Created nalog {} (customer {}, total {})", saved.getNalogNumber(), customer.getId(), saved.getTotal());
        return NalogResponse.from(saved);
    }

    // ========================================================================
    // PREVIEW (read-only: no stock reserved, nothing saved)
    // ========================================================================

    @Transactional(readOnly = true)
    public NalogPreview preview(PreviewRequest req, AuthUser actor) {
        Nalog editing = req.nalogId() == null ? null : loadAccessible(req.nalogId(), actor);
        List<NalogPartLine> lines = buildLines(req.partLines(), false, editing);
        PricingCalculator.Totals t = editing == null
                ? pricing.calculate(req.laborHours(), toPriceLines(lines))
                : pricing.calculate(req.laborHours(), toPriceLines(lines), editing.getLaborRate(), editing.getVatRate());
        return new NalogPreview(req.laborHours(), t.laborRate(), t.laborTotal(),
                lines.stream().map(l -> new NalogResponse.PartLineView(l.getPart().getId(), l.getPartSku(),
                        l.getPartName(), l.getUnitPrice(), l.getQuantity(), l.getLineTotal())).toList(),
                t.partsTotal(), t.subtotal(), t.vatRate(), t.vatAmount(), t.total());
    }

    // ========================================================================
    // STATUS CHANGE
    // ========================================================================

    /**
     * Locks the nalog row first, so two simultaneous requests are processed one after
     * the other: the second sees the new status and either no-ops or is rejected.
     * That is what stops a double-clicked "Cancel" from restoring stock twice.
     */
    @Transactional(rollbackFor = Exception.class)
    public NalogResponse changeStatus(Long id, NalogStatus target, AuthUser actor) {
        Nalog nalog = nalogRepository.findByIdForUpdate(id)
                .orElseThrow(() -> NalogException.notFound("Nalog " + id + " not found"));

        requireAccess(nalog, actor);
        NalogStatus from = nalog.getStatus();
        if (from == target) {
            return NalogResponse.from(nalog);                    // idempotent no-op
        }
        if (!NalogStatusRules.canMove(from, target)) {
            throw NalogException.conflict("Cannot change status from " + from + " to " + target
                    + ". Allowed: " + NalogStatusRules.next(from));
        }
        if (target == NalogStatus.CANCELLED && (actor == null || !actor.isAdmin())) {
            throw NalogException.forbidden("Only an admin can cancel a nalog");
        }

        if (target == NalogStatus.CANCELLED) {
            restoreStock(nalog, actor, StockMovement.Reason.NALOG_CANCEL);
        }
        if (target == NalogStatus.COMPLETED) {
            if (photoRepository.countByNalogId(nalog.getId()) == 0) {
                throw NalogException.invalid("Nalog se ne može zatvoriti bez fotografije");
            }
            if (nalog.getWorkDone() == null || nalog.getWorkDone().isBlank()) {
                throw NalogException.invalid("Nalog se ne može zatvoriti bez opisa izvršenih radova");
            }
            nalog.setCompletedAt(Instant.now());
        }
        nalog.setStatus(target);
        Nalog saved = nalogRepository.saveAndFlush(nalog);
        recordHistory(saved.getId(), from, target, actor);

        log.info("Nalog {} {} -> {} by {}", saved.getNalogNumber(), from, target, actor == null ? "?" : actor.name());
        return NalogResponse.from(saved);
    }

    /** Gives every part on the nalog back to stock + ledger rows. Call inside the caller's transaction. */
    public void restoreStock(Nalog nalog, AuthUser actor, StockMovement.Reason reason) {
        if (nalog.getPartLines().isEmpty()) {
            return;
        }
        Set<Long> ids = new TreeSet<>();
        nalog.getPartLines().forEach(l -> ids.add(l.getPart().getId()));
        Map<Long, Part> locked = new HashMap<>();
        partRepository.findAllByIdForUpdate(ids).forEach(p -> locked.put(p.getId(), p));

        for (NalogPartLine l : nalog.getPartLines()) {
            Part p = locked.get(l.getPart().getId());
            p.setStockQty(p.getStockQty() + l.getQuantity());
            movementRepository.save(StockMovement.of(p.getId(), l.getQuantity(),
                    reason, nalog.getId(), actor, nalog.getNalogNumber()));
        }
    }

    // ========================================================================
    // READ
    // ========================================================================

    @Transactional(readOnly = true)
    public NalogResponse get(Long id, AuthUser actor) {
        Nalog n = nalogRepository.findById(id)
                .orElseThrow(() -> NalogException.notFound("Nalog " + id + " not found"));
        requireAccess(n, actor);
        return NalogResponse.from(n);
    }

    @Transactional(readOnly = true)
    public List<StatusHistoryView> history(Long id, AuthUser actor) {
        Nalog n = nalogRepository.findById(id)
                .orElseThrow(() -> NalogException.notFound("Nalog " + id + " not found"));
        requireAccess(n, actor);
        return historyRepository.findByNalogIdOrderByChangedAtAscIdAsc(id).stream()
                .map(StatusHistoryView::from).toList();
    }

    @Transactional(readOnly = true)
    public PageResponse<NalogSummary> list(NalogStatus status, String q, Long assignedTo, int page, int size, AuthUser actor) {
        Specification<Nalog> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (status != null) {
                ps.add(cb.equal(root.get("status"), status));
            }
            if (actor == null || !actor.isAdmin()) {
                // Technicians only ever see what is assigned to them or what they created.
                ps.add(cb.or(cb.equal(root.get("assignedToId"), actor == null ? -1L : actor.id()),
                             cb.equal(root.get("createdById"), actor == null ? -1L : actor.id())));
            } else if (assignedTo != null) {
                ps.add(cb.equal(root.get("assignedToId"), assignedTo));
            }
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase().replace("%", "").replace("_", "") + "%";
                Join<Nalog, Customer> c = root.join("customer");
                ps.add(cb.or(
                        cb.like(cb.lower(root.get("nalogNumber")), like),
                        cb.like(cb.lower(c.get("fullName")), like),
                        cb.like(cb.lower(c.get("phone")), like),
                        cb.like(cb.lower(root.get("serialNumber")), like)));
            }
            return cb.and(ps.toArray(new Predicate[0]));
        };
        var result = nalogRepository.findAll(spec, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100),
                Sort.by(Sort.Direction.DESC, "createdAt", "id")));
        return PageResponse.of(result.map(NalogSummary::from));
    }

    // ========================================================================
    // EDIT
    // ========================================================================

    private static final Set<NalogStatus> EDITABLE =
            EnumSet.of(NalogStatus.DRAFT, NalogStatus.DISPATCHED, NalogStatus.IN_PROGRESS, NalogStatus.AWAITING_PARTS);

    /**
     * One transaction, like create: the nalog row is locked, stock is reconciled part by part (only the DIFFERENCE
     * moves, each move gets a ledger row), the money is recomputed in Java, and any failure rolls everything back.
     *
     * Prices: parts already on the nalog keep the price they were added with, a newly added part gets today's price,
     * and the labor/VAT rates stay those of the nalog. A catalogue or rate change never rewrites an open nalog.
     * COMPLETED (finished, accounting document) and CANCELLED (stock already returned) cannot be edited.
     */
    @Transactional(rollbackFor = Exception.class)
    public NalogResponse update(Long id, UpdateNalogRequest req, AuthUser actor) {
        Nalog nalog = nalogRepository.findByIdForUpdate(id)
                .orElseThrow(() -> NalogException.notFound("Nalog " + id + " not found"));
        requireAccess(nalog, actor);
        boolean closedButAdmin = nalog.getStatus() == NalogStatus.COMPLETED && actor != null && actor.isAdmin();
        if (!EDITABLE.contains(nalog.getStatus()) && !closedButAdmin) {
            throw NalogException.conflict("A " + nalog.getStatus() + " nalog cannot be edited");
        }
        if (!Objects.equals(nalog.getVersion(), req.expectedVersion())) {
            throw NalogException.conflict("This nalog was changed by someone else since you opened it. Reload it and try again.");
        }

        Customer customer = resolveCustomer(req.customerId(), req.newCustomer());

        Map<Long, Integer> wanted = new TreeMap<>();
        for (CreateNalogRequest.PartLineInput in : req.partLines()) {
            wanted.merge(in.partId(), in.quantity(), Integer::sum);
        }
        Map<Long, NalogPartLine> current = new HashMap<>();
        nalog.getPartLines().forEach(l -> current.put(l.getPart().getId(), l));

        // Lock every affected part in ascending id order (same order as create => no deadlocks).
        Set<Long> ids = new TreeSet<>(wanted.keySet());
        ids.addAll(current.keySet());
        Map<Long, Part> parts = new HashMap<>();
        if (!ids.isEmpty()) {
            partRepository.findAllByIdForUpdate(ids).forEach(p -> parts.put(p.getId(), p));
        }
        Set<Long> missing = new TreeSet<>(wanted.keySet());
        missing.removeAll(parts.keySet());
        if (!missing.isEmpty()) {
            throw NalogException.notFound("Unknown part id(s): " + missing);
        }

        List<StockMovement> movements = new ArrayList<>();
        for (Long partId : ids) {
            Part part = parts.get(partId);
            NalogPartLine line = current.get(partId);
            int oldQty = line == null ? 0 : line.getQuantity();
            int newQty = wanted.getOrDefault(partId, 0);
            int delta = newQty - oldQty;                         // > 0 takes from stock, < 0 gives back

            if (newQty > 999) {
                throw NalogException.invalid("Quantity for " + part.getSku() + " exceeds 999");
            }
            if (delta > 0) {
                if (!part.isActive()) {
                    throw NalogException.invalid("Part " + part.getSku() + " is discontinued");
                }
                if (part.getStockQty() < delta) {
                    throw NalogException.conflict("Not enough stock for " + part.getSku()
                            + " (need " + delta + " more, available " + part.getStockQty() + ")");
                }
            }
            if (delta != 0) {
                part.setStockQty(part.getStockQty() - delta);
                movements.add(StockMovement.of(partId, -delta, StockMovement.Reason.NALOG_EDIT,
                        nalog.getId(), actor, nalog.getNalogNumber()));
            }

            if (newQty == 0) {
                nalog.getPartLines().remove(line);               // orphanRemoval deletes the row
            } else if (line != null) {
                line.setQuantity(newQty);
                line.setLineTotal(pricing.lineTotal(line.getUnitPrice(), newQty));
            } else {
                NalogPartLine fresh = new NalogPartLine();
                fresh.setPart(part);
                fresh.setPartSku(part.getSku());
                fresh.setPartName(part.getName());
                fresh.setUnitPrice(part.getUnitPrice());
                fresh.setQuantity(newQty);
                fresh.setLineTotal(pricing.lineTotal(part.getUnitPrice(), newQty));
                nalog.addPartLine(fresh);
            }
        }

        PricingCalculator.Totals t = pricing.calculate(req.laborHours(), toPriceLines(nalog.getPartLines()),
                nalog.getLaborRate(), nalog.getVatRate());

        nalog.setCustomer(customer);
        nalog.setApplianceType(req.appliance().type());
        nalog.setApplianceBrand(req.appliance().brand().trim());
        nalog.setApplianceModel(blankToNull(req.appliance().model()));
        nalog.setSerialNumber(blankToNull(req.appliance().serialNumber()));
        nalog.setDiagnosis(req.diagnosis().trim());
        nalog.setWorkDone(blankToNull(req.workDone()));
        nalog.setLaborHours(req.laborHours());
        nalog.setLaborTotal(t.laborTotal());
        nalog.setPartsTotal(t.partsTotal());
        nalog.setSubtotal(t.subtotal());
        nalog.setVatAmount(t.vatAmount());
        nalog.setTotal(t.total());
        nalog.setPaymentType(req.paymentType());

        Nalog saved = nalogRepository.saveAndFlush(nalog);
        movements.forEach(movementRepository::save);

        log.info("Edited nalog {} by {} (total now {})", saved.getNalogNumber(), actor == null ? "?" : actor.name(), saved.getTotal());
        return NalogResponse.from(saved);
    }

    // ========================================================================
    // ASSIGNMENT (admin only, enforced in the controller AND here)
    // ========================================================================

    @Transactional(rollbackFor = Exception.class)
    public NalogResponse assign(Long id, Long technicianId, AuthUser actor) {
        if (actor == null || !actor.isAdmin()) {
            throw NalogException.forbidden("Only an admin can assign a nalog");
        }
        Nalog nalog = nalogRepository.findByIdForUpdate(id)
                .orElseThrow(() -> NalogException.notFound("Nalog " + id + " not found"));
        if (nalog.getStatus() == NalogStatus.COMPLETED || nalog.getStatus() == NalogStatus.CANCELLED) {
            throw NalogException.conflict("A " + nalog.getStatus() + " nalog cannot be reassigned");
        }
        AppUser assignee = technicianId == null ? null : requireActiveTechnician(technicianId);
        Long previousAssignee = nalog.getAssignedToId();
        nalog.setAssignedToId(assignee == null ? null : assignee.getId());
        nalog.setAssignedToName(assignee == null ? null : assignee.getName());
        log.info("Nalog {} assigned to {} by {}", nalog.getNalogNumber(), assignee == null ? "nobody" : assignee.getName(), actor.name());
        Nalog assigned = nalogRepository.saveAndFlush(nalog);
        if (assignee != null && !Objects.equals(assignee.getId(), previousAssignee)
                && !Objects.equals(assignee.getId(), actor.id())) {
            pushNotifier.notifyAssigned(assignee.getId(), assigned.getId(), assigned.getNalogNumber());
        }
        return NalogResponse.from(assigned);
    }

    /**
     * Assign (or un-assign, technicianId null) a selection, all or nothing: a COMPLETED / CANCELLED nalog in the
     * selection refuses the whole request. One transaction; each nalog goes through the single assign path.
     */
    @Transactional(rollbackFor = Exception.class)
    public int assignMany(List<Long> ids, Long technicianId, AuthUser actor) {
        if (actor == null || !actor.isAdmin()) {
            throw NalogException.forbidden("Only an admin can assign a nalog");
        }
        List<Long> sorted = ids.stream().distinct().sorted().toList();
        List<Nalog> found = nalogRepository.findAllById(sorted);
        if (found.size() != sorted.size()) {
            throw NalogException.notFound("Neki izabrani nalozi više ne postoje. Ništa nije promenjeno.");
        }
        List<String> closed = found.stream()
                .filter(n -> n.getStatus() == NalogStatus.COMPLETED || n.getStatus() == NalogStatus.CANCELLED)
                .map(Nalog::getNalogNumber).sorted().toList();
        if (!closed.isEmpty()) {
            throw NalogException.conflict("Završeni ili otkazani nalozi se ne mogu dodeliti: " + String.join(", ", closed)
                    + ". Ništa nije promenjeno.");
        }
        for (Long id : sorted) {
            assign(id, technicianId, actor);
        }
        return sorted.size();
    }

    /** Customer autocomplete (top 10). Reusing a customer avoids duplicate records per nalog. */
    @Transactional(readOnly = true)
    public List<NalogResponse.CustomerView> searchCustomers(String q) {
        String cleaned = q == null ? "" : q.trim().toLowerCase().replace("%", "").replace("_", "");
        if (cleaned.length() < 2) {
            return List.of();
        }
        return customerRepository.search("%" + cleaned + "%", org.springframework.data.domain.PageRequest.of(0, 10)).stream()
                .map(c -> new NalogResponse.CustomerView(c.getId(), c.getFullName(), c.getAddress(), c.getCity(),
                        c.getPhone(), c.getEmail(), c.getLocationNotes()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TechnicianView> technicians() {
        return userRepository.findByRoleAndActiveTrueOrderByNameAsc("technician").stream().map(TechnicianView::from).toList();
    }

    // ========================================================================
    // helpers
    // ========================================================================

    /**
     * Turns requested part ids/quantities into price-snapshotted lines.
     * reserve=true  (create):  SELECT FOR UPDATE + decrement stock.
     * reserve=false (preview): plain read, nothing changes.
     * TreeMap => ascending id => consistent lock order => no deadlocks.
     */
    private List<NalogPartLine> buildLines(List<CreateNalogRequest.PartLineInput> inputs, boolean reserve, Nalog editing) {
        // Editing preview only: parts already on the nalog keep the snapshot they were added with.
        Map<Long, NalogPartLine> onNalog = new HashMap<>();
        if (editing != null) {
            editing.getPartLines().forEach(l -> onNalog.put(l.getPart().getId(), l));
        }
        Map<Long, Integer> wanted = new TreeMap<>();
        for (CreateNalogRequest.PartLineInput in : inputs) {
            wanted.merge(in.partId(), in.quantity(), Integer::sum);
        }
        if (wanted.isEmpty()) {
            return List.of();
        }

        List<Part> parts = new ArrayList<>(reserve
                ? partRepository.findAllByIdForUpdate(wanted.keySet())
                : partRepository.findAllById(wanted.keySet()));

        if (parts.size() != wanted.size()) {
            Set<Long> missing = new TreeSet<>(wanted.keySet());
            parts.forEach(p -> missing.remove(p.getId()));
            throw NalogException.notFound("Unknown part id(s): " + missing);
        }
        parts.sort(Comparator.comparing(Part::getId));

        List<NalogPartLine> lines = new ArrayList<>();
        for (Part part : parts) {
            int qty = wanted.get(part.getId());
            NalogPartLine old = onNalog.get(part.getId());
            int alreadyOnNalog = old == null ? 0 : old.getQuantity();
            if (!part.isActive() && qty > alreadyOnNalog) {
                throw NalogException.invalid("Part " + part.getSku() + " is discontinued");
            }
            if (qty > 999) {
                throw NalogException.invalid("Quantity for " + part.getSku() + " exceeds 999");
            }
            if (part.getStockQty() + alreadyOnNalog < qty) {
                throw NalogException.conflict("Not enough stock for " + part.getSku()
                        + " (requested " + qty + ", available " + part.getStockQty() + ")");
            }
            if (reserve) {
                part.setStockQty(part.getStockQty() - qty);       // flushed with the commit
            }
            NalogPartLine line = new NalogPartLine();
            line.setPart(part);
            line.setPartSku(old != null ? old.getPartSku() : part.getSku());             // snapshots: catalogue edits
            line.setPartName(old != null ? old.getPartName() : part.getName());          // must never rewrite history
            line.setUnitPrice(old != null ? old.getUnitPrice() : part.getUnitPrice());
            line.setQuantity(qty);
            line.setLineTotal(pricing.lineTotal(line.getUnitPrice(), qty));
            lines.add(line);
        }
        return lines;
    }

    private static List<PricingCalculator.Line> toPriceLines(List<NalogPartLine> lines) {
        return lines.stream().map(l -> new PricingCalculator.Line(l.getUnitPrice(), l.getQuantity())).toList();
    }

    private void recordHistory(Long nalogId, NalogStatus from, NalogStatus to, AuthUser actor) {
        NalogStatusHistory h = new NalogStatusHistory();
        h.setNalogId(nalogId);
        h.setFromStatus(from);
        h.setToStatus(to);
        if (actor != null) {
            h.setChangedById(actor.id());
            h.setChangedByName(actor.name());
        }
        historyRepository.save(h);
    }

    /**
     * Admin: any / none. Technician: only self. 404 (not 403) when a technician asks for
     * someone else's nalog, so ids can't be probed.
     */
    private void requireAccess(Nalog n, AuthUser actor) {
        if (actor != null && actor.isAdmin()) {
            return;
        }
        boolean mine = actor != null && (Objects.equals(n.getAssignedToId(), actor.id())
                || Objects.equals(n.getCreatedById(), actor.id()));
        if (!mine) {
            throw NalogException.notFound("Nalog " + n.getId() + " not found");
        }
    }

    /** Admin: set or clear the planned visit. Closed nalozi are history and cannot be rescheduled. */
    @Transactional(rollbackFor = Exception.class)
    public NalogResponse setSchedule(Long id, Instant scheduledAt, AuthUser actor) {
        Nalog n = nalogRepository.findByIdForUpdate(id)
                .orElseThrow(() -> NalogException.notFound("Nalog " + id + " not found"));
        requireAccess(n, actor);
        if (n.getStatus() == NalogStatus.COMPLETED || n.getStatus() == NalogStatus.CANCELLED) {
            throw NalogException.conflict("A completed or cancelled nalog cannot be rescheduled");
        }
        n.setScheduledAt(scheduledAt);
        return NalogResponse.from(n);
    }

    /** For sibling services (photos): loads the nalog and applies the SAME access rule as everything else. */
    @Transactional(readOnly = true)
    public Nalog loadAccessible(Long id, AuthUser actor) {
        Nalog n = nalogRepository.findById(id)
                .orElseThrow(() -> NalogException.notFound("Nalog " + id + " not found"));
        requireAccess(n, actor);
        return n;
    }

    private AppUser resolveAssignee(Long requestedId, AuthUser actor) {
        if (actor != null && !actor.isAdmin()) {
            if (requestedId != null && !requestedId.equals(actor.id())) {
                throw NalogException.forbidden("Technicians can only assign a nalog to themselves");
            }
            return userRepository.findById(actor.id()).orElse(null);
        }
        return requestedId == null ? null : requireActiveTechnician(requestedId);
    }

    private AppUser requireActiveTechnician(Long id) {
        AppUser u = userRepository.findById(id)
                .orElseThrow(() -> NalogException.notFound("User " + id + " is unknown to the nalog service (they must log in once, or run the import)"));
        if (!u.isActive() || !u.isTechnician()) {
            throw NalogException.invalid("User " + id + " is not an active technician");
        }
        return u;
    }

    private Customer resolveCustomer(CreateNalogRequest req) {
        return resolveCustomer(req.customerId(), req.newCustomer());
    }

    private Customer resolveCustomer(Long customerId, CreateNalogRequest.CustomerInput newCustomer) {
        boolean hasId = customerId != null;
        boolean hasNew = newCustomer != null;
        if (hasId == hasNew) {
            throw NalogException.invalid("Provide exactly one of customerId or newCustomer");
        }
        if (hasId) {
            return customerRepository.findById(customerId)
                    .orElseThrow(() -> NalogException.notFound("Customer " + customerId + " not found"));
        }
        CreateNalogRequest.CustomerInput in = newCustomer;
        Customer c = new Customer();
        c.setFullName(in.fullName().trim());
        c.setAddress(in.address().trim());
        c.setCity(blankToNull(in.city()));
        c.setPhone(in.phone().trim());
        c.setEmail(blankToNull(in.email()));
        c.setLocationNotes(blankToNull(in.locationNotes()));
        return customerRepository.save(c);
    }

    /** N-2026-000123. Sequence-backed, so concurrent requests never collide. */
    private String nextNalogNumber() {
        long seq = ((Number) em.createNativeQuery("select nextval('nalog_number_seq')").getSingleResult()).longValue();
        return String.format("N-%d-%06d", Year.now().getValue(), seq);
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}
