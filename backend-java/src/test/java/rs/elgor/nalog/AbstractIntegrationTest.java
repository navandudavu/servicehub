package rs.elgor.nalog;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

import java.math.BigDecimal;

/**
 * Real PostgreSQL in Docker (Testcontainers), real Flyway migrations, real transactions.
 * One container is shared by every test class; tables are emptied before each test.
 * Needs Docker Desktop running.
 */
@SpringBootTest
public abstract class AbstractIntegrationTest {

    static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    static {
        PG.start();   // stopped automatically by Testcontainers' Ryuk when the JVM exits
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", PG::getJdbcUrl);
        r.add("spring.datasource.username", PG::getUsername);
        r.add("spring.datasource.password", PG::getPassword);
        r.add("nalog.security.jwt-secret", () -> "test-secret-test-secret-test-secret-123456");
        r.add("nalog.photos.dir", () -> System.getProperty("java.io.tmpdir") + "/nalog-test-photos");
    }

    @Autowired protected JdbcTemplate jdbc;

    @BeforeEach
    void cleanDatabase() {
        jdbc.execute("TRUNCATE nalog_photo, stock_movement, nalog_status_history, nalog_part_line, nalog, customer, parts, app_user RESTART IDENTITY CASCADE");
    }

    protected long insertUser(long id, String name, String role) {
        jdbc.update("INSERT INTO app_user (id, name, role, active, last_seen_at) VALUES (?, ?, ?, TRUE, now())", id, name, role);
        return id;
    }

    protected long insertPart(String sku, String price, int stock) {
        return jdbc.queryForObject(
                "INSERT INTO parts (sku, name, unit_price, stock_qty, active, created_at, updated_at, version) "
              + "VALUES (?, ?, ?, ?, TRUE, now(), now(), 0) RETURNING id",
                Long.class, sku, "Part " + sku, new BigDecimal(price), stock);
    }

    protected int stockOf(long partId) {
        return jdbc.queryForObject("SELECT stock_qty FROM parts WHERE id = ?", Integer.class, partId);
    }

    protected int count(String table) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
    }
}
