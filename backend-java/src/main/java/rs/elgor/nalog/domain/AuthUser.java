package rs.elgor.nalog.domain;

/** The caller, as decoded from the ServiceHub JWT: {id, role, name}. */
public record AuthUser(long id, String name, String role) {
    /** Admin-level powers: admins and managers. */
    public boolean isAdmin() {
        return "admin".equalsIgnoreCase(role) || "manager".equalsIgnoreCase(role);
    }

    /** Only the admin account type manages the team (the Tim tab: accounts, roles, passwords). */
    public boolean isOwner() {
        return "admin".equalsIgnoreCase(role);
    }
}
