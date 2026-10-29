package rs.elgor.nalog.domain;

/** The caller, as decoded from the ServiceHub JWT: {id, role, name}. */
public record AuthUser(long id, String name, String role) {
    public boolean isAdmin() {
        return "admin".equalsIgnoreCase(role);
    }
}
