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
 * Real PostgreSQL, real Flyway migrations, real transactions (see EXTERNAL_URL below for the no-Docker option).
 * One database is shared by every test class; tables are emptied before each test.
 */
@SpringBootTest
public abstract class AbstractIntegrationTest {

    /**
     * Two ways to get a PostgreSQL:
     *  1. NALOG_TEST_DB_URL set (e.g. jdbc:postgresql://localhost:5432/nalog_test): use that server, no Docker needed.
     *     The database name MUST end with _test, because every test starts by TRUNCATE-ing all tables.
     *     Optional: NALOG_TEST_DB_USER (default nalog), NALOG_TEST_DB_PASSWORD (default dev).
     *  2. Otherwise a throw-away PostgreSQL in Docker (Testcontainers). Needs Docker Desktop running.
     */
    static final String EXTERNAL_URL = System.getenv("NALOG_TEST_DB_URL");
    static PostgreSQLContainer<?> PG;

    static {
        if (EXTERNAL_URL == null || EXTERNAL_URL.isBlank()) {
            PG = new PostgreSQLContainer<>("postgres:16-alpine");
            PG.start();   // stopped automatically by Testcontainers' Ryuk when the JVM exits
        } else {
            String dbName = EXTERNAL_URL.substring(EXTERNAL_URL.lastIndexOf('/') + 1).split("\\?")[0];
            if (!dbName.endsWith("_test")) {
                throw new IllegalStateException("Refusing to run: NALOG_TEST_DB_URL must point to a database whose name ends with _test "
                        + "(the tests delete all rows). Got: " + dbName);
            }
        }
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        if (PG != null) {
            r.add("spring.datasource.url", PG::getJdbcUrl);
            r.add("spring.datasource.username", PG::getUsername);
            r.add("spring.datasource.password", PG::getPassword);
        } else {
            r.add("spring.datasource.url", () -> EXTERNAL_URL);
            r.add("spring.datasource.username", () -> System.getenv().getOrDefault("NALOG_TEST_DB_USER", "nalog"));
            r.add("spring.datasource.password", () -> System.getenv().getOrDefault("NALOG_TEST_DB_PASSWORD", "dev"));
        }
        r.add("nalog.security.jwt-secret", () -> "test-secret-test-secret-test-secret-123456");
        r.add("nalog.auth.check-session", () -> "false");          // the session filter has its own test
        r.add("nalog.bootstrap.enabled", () -> "false");           // tests create their own users
        r.add("nalog.push.enabled", () -> "false");
        r.add("nalog.photos.dir", () -> System.getProperty("java.io.tmpdir") + "/nalog-test-photos");
    }

    @Autowired protected JdbcTemplate jdbc;

    @BeforeEach
    void cleanDatabase() {
        jdbc.execute("TRUNCATE nalog_deleted_log, nalog_note, nalog_photo, stock_movement, nalog_status_history, nalog_part_line, nalog, customer, parts, app_user RESTART IDENTITY CASCADE");
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
