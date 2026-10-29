package rs.elgor.nalog.service;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.domain.Part;
import rs.elgor.nalog.domain.StockMovement;
import rs.elgor.nalog.dto.PageResponse;
import rs.elgor.nalog.dto.PartDtos.*;
import rs.elgor.nalog.repo.PartRepository;
import rs.elgor.nalog.repo.StockMovementRepository;

import java.util.List;

@Service
public class PartService {

    private final PartRepository partRepository;
    private final StockMovementRepository movementRepository;

    public PartService(PartRepository partRepository, StockMovementRepository movementRepository) {
        this.partRepository = partRepository;
        this.movementRepository = movementRepository;
    }

    /** Inventory lookup used by the nalog form's part picker. */
    @Transactional(readOnly = true)
    public PageResponse<PartResponse> search(String q, boolean onlyActive, int page, int size) {
        String cleaned = q == null ? "" : q.trim().toLowerCase().replace("%", "").replace("_", "");
        var result = partRepository.search("%" + cleaned + "%", onlyActive,
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100), Sort.by("name")));
        return PageResponse.of(result.map(PartResponse::from));
    }

    @Transactional(rollbackFor = Exception.class)
    public PartResponse create(CreatePartRequest req, AuthUser actor) {
        String sku = req.sku().trim();
        if (partRepository.existsBySku(sku)) {
            throw NalogException.conflict("SKU " + sku + " already exists");
        }
        Part p = new Part();
        p.setSku(sku);
        p.setName(req.name().trim());
        p.setUnitPrice(req.unitPrice().setScale(2, java.math.RoundingMode.HALF_UP));
        p.setStockQty(req.stockQty());
        p = partRepository.saveAndFlush(p);
        if (req.stockQty() > 0) {
            movementRepository.save(StockMovement.of(p.getId(), req.stockQty(), StockMovement.Reason.INITIAL, null, actor, null));
        }
        return PartResponse.from(p);
    }

    /**
     * Price change affects FUTURE nalozi only: existing ones hold a price snapshot.
     */
    @Transactional(rollbackFor = Exception.class)
    public PartResponse update(Long id, UpdatePartRequest req) {
        Part p = partRepository.findById(id).orElseThrow(() -> NalogException.notFound("Part " + id + " not found"));
        p.setName(req.name().trim());
        p.setUnitPrice(req.unitPrice().setScale(2, java.math.RoundingMode.HALF_UP));
        p.setActive(req.active());
        return PartResponse.from(partRepository.saveAndFlush(p));
    }

    /** Locked read-modify-write + ledger row, atomically. */
    @Transactional(rollbackFor = Exception.class)
    public PartResponse adjustStock(Long id, StockAdjustRequest req, AuthUser actor) {
        if (req.delta() == 0) {
            throw NalogException.invalid("delta must not be 0");
        }
        List<Part> locked = partRepository.findAllByIdForUpdate(List.of(id));
        if (locked.isEmpty()) {
            throw NalogException.notFound("Part " + id + " not found");
        }
        Part p = locked.get(0);
        int newQty = p.getStockQty() + req.delta();
        if (newQty < 0) {
            throw NalogException.conflict("Stock cannot go below zero (have " + p.getStockQty() + ", delta " + req.delta() + ")");
        }
        p.setStockQty(newQty);
        movementRepository.save(StockMovement.of(id, req.delta(), StockMovement.Reason.MANUAL, null, actor, req.note()));
        return PartResponse.from(partRepository.saveAndFlush(p));
    }
}
