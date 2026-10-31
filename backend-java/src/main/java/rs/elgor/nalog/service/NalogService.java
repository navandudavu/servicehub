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

    @PersistenceContext
    private EntityManager em;

    public NalogService(NalogRepository nalogRepository,
                        CustomerRepository customerRepository,
                        PartRepository partRepository,
                        NalogStatusHistoryRepository historyRepository,
                        StockMovementRepository movementRepository,
                        AppUserRepository userRepository,
                        PricingCalculator pricing) {
        this.nalogRepository = nalogRepository;
        this.customerRepository = customerRepository;
        this.partRepository = partRepository;
        this.historyRepository = historyRepository;
        this.movementRepository = movementRepository;
        this.userRepository = userRepository;
        this.pricing = pricing;
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
        List<NalogPartLine> lines = buildLines(req.partLines(), true);
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
    public NalogPreview preview(PreviewRequest req) {
        List<NalogPartLine> lines = buildLines(req.partLines(), false);
        PricingCalculator.Totals t = pricing.calculate(req.laborHours(), toPriceLines(lines));
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
            restoreStock(nalog, actor);
        }
        if (target == NalogStatus.COMPLETED) {
            nalog.setCompletedAt(Instant.now());
        }
        nalog.setStatus(target);
        Nalog saved = nalogRepository.saveAndFlush(nalog);
        recordHistory(saved.getId(), from, target, actor);

        log.info("Nalog {} {} -> {} by {}", saved.getNalogNumber(), from, target, actor == null ? "?" : actor.name());
        return NalogResponse.from(saved);
    }

    private void restoreStock(Nalog nalog, AuthUser actor) {
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
                    StockMovement.Reason.NALOG_CANCEL, nalog.getId(), actor, nalog.getNalogNumber()));
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
        nalog.setAssignedToId(assignee == null ? null : assignee.getId());
        nalog.setAssignedToName(assignee == null ? null : assignee.getName());
        log.info("Nalog {} assigned to {} by {}", nalog.getNalogNumber(), assignee == null ? "nobody" : assignee.getName(), actor.name());
        return NalogResponse.from(nalogRepository.saveAndFlush(nalog));
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
    private List<NalogPartLine> buildLines(List<CreateNalogRequest.PartLineInput> inputs, boolean reserve) {
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
            if (!part.isActive()) {
                throw NalogException.invalid("Part " + part.getSku() + " is discontinued");
            }
            if (qty > 999) {
                throw NalogException.invalid("Quantity for " + part.getSku() + " exceeds 999");
            }
            if (part.getStockQty() < qty) {
                throw NalogException.conflict("Not enough stock for " + part.getSku()
                        + " (requested " + qty + ", available " + part.getStockQty() + ")");
            }
            if (reserve) {
                part.setStockQty(part.getStockQty() - qty);       // flushed with the commit
            }
            NalogPartLine line = new NalogPartLine();
            line.setPart(part);
            line.setPartSku(part.getSku());                       // snapshots: catalogue edits
            line.setPartName(part.getName());                     // must never rewrite history
            line.setUnitPrice(part.getUnitPrice());
            line.setQuantity(qty);
            line.setLineTotal(pricing.lineTotal(part.getUnitPrice(), qty));
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
        boolean hasId = req.customerId() != null;
        boolean hasNew = req.newCustomer() != null;
        if (hasId == hasNew) {
            throw NalogException.invalid("Provide exactly one of customerId or newCustomer");
        }
        if (hasId) {
            return customerRepository.findById(req.customerId())
                    .orElseThrow(() -> NalogException.notFound("Customer " + req.customerId() + " not found"));
        }
        CreateNalogRequest.CustomerInput in = req.newCustomer();
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
