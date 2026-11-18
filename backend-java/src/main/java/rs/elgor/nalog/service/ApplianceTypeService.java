package rs.elgor.nalog.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.domain.ApplianceType;
import rs.elgor.nalog.domain.ApplianceTypeCustom;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.repo.ApplianceTypeCustomRepository;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Device types: the built-in codes (AIR_CONDITIONER ...; OTHER is no longer offered) followed by the names the
 * admin added with "Dodaj novi uredjaj". A nalog stores the code, or the custom name itself.
 */
@Service
public class ApplianceTypeService {

    private final ApplianceTypeCustomRepository custom;

    public ApplianceTypeService(ApplianceTypeCustomRepository custom) {
        this.custom = custom;
    }

    /** What the dropdown shows, in order. */
    @Transactional(readOnly = true)
    public List<String> list() {
        List<String> out = new ArrayList<>();
        for (ApplianceType t : ApplianceType.values()) {
            if (t != ApplianceType.OTHER) {
                out.add(t.name());
            }
        }
        custom.findAllByOrderByNameAsc().forEach(c -> out.add(c.getName()));
        return out;
    }

    /** Admin-level adds a type; it is available to the dropdown at once. Returns the new list. */
    @Transactional(rollbackFor = Exception.class)
    public List<String> add(String rawName, AuthUser actor) {
        if (actor == null || !actor.isAdmin()) {
            throw NalogException.forbidden("Permission denied");
        }
        String name = rawName == null ? "" : rawName.trim().replaceAll("\\s+", " ");
        if (name.isEmpty() || name.length() > 100) {
            throw NalogException.invalid("Naziv uređaja je obavezan (najviše 100 znakova)");
        }
        boolean builtIn = Arrays.stream(ApplianceType.values()).anyMatch(t -> t.name().equalsIgnoreCase(name));
        if (builtIn || custom.existsByNameIgnoreCase(name)) {
            throw NalogException.conflict("Taj tip uređaja već postoji");
        }
        ApplianceTypeCustom c = new ApplianceTypeCustom();
        c.setName(name);
        c.setCreatedBy(actor.name());
        custom.saveAndFlush(c);
        return list();
    }

    /** A nalog may only use a type from the list, or the legacy OTHER on a nalog that already has it. */
    @Transactional(readOnly = true)
    public void requireKnown(String type) {
        if (type == null || type.isBlank()) {
            throw NalogException.invalid("Tip uređaja je obavezan");
        }
        String t = type.trim();
        if (ApplianceType.OTHER.name().equals(t) || list().contains(t)) {
            return;
        }
        throw NalogException.invalid("Nepoznat tip uređaja: " + t);
    }
}
