package rs.elgor.nalog.service;

import org.springframework.http.HttpStatus;

/**
 * Business-rule failure with the HTTP status it maps to. RuntimeException on purpose:
 * Spring's @Transactional rolls back on unchecked exceptions by default, and the
 * service additionally sets rollbackFor = Exception.class to cover checked ones too.
 */
public class NalogException extends RuntimeException {

    private final HttpStatus status;

    public NalogException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public static NalogException invalid(String msg)  { return new NalogException(HttpStatus.BAD_REQUEST, msg); }
    public static NalogException notFound(String msg) { return new NalogException(HttpStatus.NOT_FOUND, msg); }
    public static NalogException forbidden(String msg) { return new NalogException(HttpStatus.FORBIDDEN, msg); }
    public static NalogException conflict(String msg) { return new NalogException(HttpStatus.CONFLICT, msg); }
}
