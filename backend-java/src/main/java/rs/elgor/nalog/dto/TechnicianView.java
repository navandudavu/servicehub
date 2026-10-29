package rs.elgor.nalog.dto;

import rs.elgor.nalog.domain.AppUser;

public record TechnicianView(Long id, String name) {
    public static TechnicianView from(AppUser u) {
        return new TechnicianView(u.getId(), u.getName());
    }
}
