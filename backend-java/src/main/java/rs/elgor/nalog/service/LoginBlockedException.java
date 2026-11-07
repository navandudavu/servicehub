package rs.elgor.nalog.service;

import org.springframework.http.HttpStatus;

/** Too many failed logins: 429 with a Retry-After header (added by GlobalExceptionHandler). */
public class LoginBlockedException extends NalogException {

    private final long retryAfterSeconds;

    public LoginBlockedException(long retryAfterSeconds) {
        super(HttpStatus.TOO_MANY_REQUESTS, "Too many failed attempts. Try again later.");
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
