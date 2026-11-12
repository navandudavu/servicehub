package rs.elgor.nalog.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.domain.AppUser;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.domain.CarriedItem;
import rs.elgor.nalog.dto.CarriedDtos.CarriedRequest;
import rs.elgor.nalog.dto.CarriedDtos.CarriedView;
import rs.elgor.nalog.repo.AppUserRepository;
import rs.elgor.nalog.repo.CarriedItemRepository;

import java.util.List;

/**
 * Zaduzivanje / razduzivanje: the list of material a technician carries. A technician manages his own list,
 * an admin or manager manages anybody's. There is no link to the warehouse (parts) and no stock movement.
 */
@Service
public class CarriedItemService {

    static final int MAX_PER_TECHNICIAN = 50;

    private final CarriedItemRepository items;
    private final AppUserRepository users;

    public CarriedItemService(CarriedItemRepository items, AppUserRepository users) {
        this.items = items;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public List<CarriedView> list(Long technicianId, AuthUser actor) {
        return items.findByTechnicianIdOrderByNameAscIdAsc(targetTechnician(technicianId, actor))
                .stream().map(CarriedView::from).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public CarriedView add(CarriedRequest req, AuthUser actor) {
        long technicianId = targetTechnician(req.technicianId(), actor);
        AppUser tech = users.findById(technicianId).orElseThrow(() -> NalogException.notFound("Serviser ne postoji"));
        if (!"technician".equalsIgnoreCase(tech.getRole())) {
            throw NalogException.invalid("Zaduženje se vodi samo za servisere");
        }
        if (items.countByTechnicianId(technicianId) >= MAX_PER_TECHNICIAN) {
            throw NalogException.conflict("Najviše " + MAX_PER_TECHNICIAN + " stavki po serviseru");
        }
        CarriedItem c = new CarriedItem();
        c.setTechnicianId(technicianId);
        fill(c, req);
        return CarriedView.from(items.saveAndFlush(c));
    }

    @Transactional(rollbackFor = Exception.class)
    public CarriedView update(Long id, CarriedRequest req, AuthUser actor) {
        CarriedItem c = loadAccessible(id, actor);
        fill(c, req);
        return CarriedView.from(items.saveAndFlush(c));
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id, AuthUser actor) {
        items.delete(loadAccessible(id, actor));
    }

    /** Technician: always himself (asking for somebody else is a 403). Admin/manager: the technician named in the request. */
    private static long targetTechnician(Long requested, AuthUser actor) {
        if (actor == null) {
            throw NalogException.forbidden("Permission denied");
        }
        if (!actor.isAdmin()) {
            if (requested != null && requested != actor.id()) {
                throw NalogException.forbidden("Permission denied");
            }
            return actor.id();
        }
        if (requested == null) {
            throw NalogException.invalid("technicianId is required");
        }
        return requested;
    }

    private CarriedItem loadAccessible(Long id, AuthUser actor) {
        CarriedItem c = items.findById(id).orElseThrow(() -> NalogException.notFound("Stavka ne postoji"));
        if (actor == null || (!actor.isAdmin() && c.getTechnicianId() != actor.id())) {
            throw NalogException.notFound("Stavka ne postoji");       // not yours = not there
        }
        return c;
    }

    private static void fill(CarriedItem c, CarriedRequest req) {
        String name = req.name() == null ? "" : req.name().trim();
        if (name.isEmpty()) {
            throw NalogException.invalid("Naziv je obavezan");
        }
        String sku = req.sku() == null ? "" : req.sku().trim();
        c.setName(name);
        c.setSku(sku.isEmpty() ? null : sku);
        c.setQuantity(req.quantity());
    }
}
