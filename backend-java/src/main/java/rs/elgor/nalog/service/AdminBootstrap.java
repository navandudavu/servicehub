package rs.elgor.nalog.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * First start of a new install: with nobody able to log in, create one admin and print the random password ONCE
 * in the service log (docker compose logs java | grep -A4 "FIRST ADMIN"). Change it right after the first login.
 */
@Component
@ConditionalOnProperty(name = "nalog.bootstrap.enabled", havingValue = "true", matchIfMissing = true)
public class AdminBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

    private final UserAdminService users;
    private final String email;

    public AdminBootstrap(UserAdminService users,
                          @Value("${nalog.bootstrap.admin-email:admin@servicehub.local}") String email) {
        this.users = users;
        this.email = email;
    }

    @Override
    public void run(ApplicationArguments args) {
        users.bootstrapAdminIfNone(email).ifPresent(password -> log.warn(
                "\n==================== FIRST ADMIN ====================\n"
              + "  email:    {}\n"
              + "  password: {}\n"
              + "  Shown only now. Log in and change it immediately.\n"
              + "=====================================================", email, password));
    }
}
