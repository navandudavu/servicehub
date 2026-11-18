package rs.elgor.nalog;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.domain.StockDoc;
import rs.elgor.nalog.dto.StockDocDtos.*;
import rs.elgor.nalog.service.NalogException;
import rs.elgor.nalog.service.StockDocService;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class StockDocIntegrationTest extends AbstractIntegrationTest {

    @Autowired StockDocService service;

    AuthUser admin = new AuthUser(1, "Admin", "admin");
    AuthUser manager = new AuthUser(4, "Menadžer", "manager");
    AuthUser tech2 = new AuthUser(2, "Tehničar Dva", "technician");
    AuthUser tech3 = new AuthUser(3, "Tehničar Tri", "technician");

    @BeforeEach
    void users() {
        insertUser(1, "Admin", "admin");
        insertUser(2, "Tehničar Dva", "technician");
        insertUser(3, "Tehničar Tri", "technician");
        insertUser(4, "Menadžer", "manager");
    }

    private DocView make(StockDoc.Type type, long tech, long part, String qty, AuthUser actor) {
        return service.create(new CreateRequest(type, tech, null, List.of(new LineRequest(part, new BigDecimal(qty)))), actor);
    }

    @Test
    void zaduzenjeAndRazduzenjeCountSeparatelyFromOne() {
        long a = insertPart("A");
        assertEquals(1, make(StockDoc.Type.ZAD, 2, a, "2", admin).docNo());
        assertEquals(2, make(StockDoc.Type.ZAD, 2, a, "1", manager).docNo());
        assertEquals(1, make(StockDoc.Type.RAZ, 2, a, "1", admin).docNo());
    }

    @Test
    void aTechnicianCannotWriteAndOnlySeesHisOwnDocuments() {
        long a = insertPart("A");
        DocView d = make(StockDoc.Type.ZAD, 2, a, "2", admin);

        assertEquals(403, assertThrows(NalogException.class, () -> make(StockDoc.Type.ZAD, 2, a, "1", tech2)).getStatus().value());
        assertEquals(403, assertThrows(NalogException.class,
                () -> service.update(d.id(), new UpdateRequest(2L, Instant.now(), List.of(new LineRequest(a, BigDecimal.ONE))), tech2)).getStatus().value());

        assertEquals(1, service.list(null, null, null, null, 0, 30, tech2).items().size());
        assertEquals(0, service.list(null, null, null, null, 0, 30, tech3).items().size());
        assertEquals(404, assertThrows(NalogException.class, () -> service.get(d.id(), tech3)).getStatus().value());
        assertEquals(403, assertThrows(NalogException.class, () -> service.list(null, 2L, null, null, 0, 30, tech3)).getStatus().value());
    }

    @Test
    void anEditKeepsTheOldVersionAndNothingCanBeDeleted() {
        long a = insertPart("A");
        long b = insertPart("B");
        DocView d = make(StockDoc.Type.ZAD, 2, a, "2", admin);

        DocView e = service.update(d.id(), new UpdateRequest(2L, d.docAt(), List.of(new LineRequest(b, new BigDecimal("5")))), manager);

        assertEquals(d.docNo(), e.docNo());
        assertEquals("Menadžer", e.updatedByName());
        assertEquals(1, e.lines().size());
        assertEquals("B", e.lines().get(0).sku());
        assertEquals(1, service.revisions(d.id(), admin).size());
        assertTrue(service.revisions(d.id(), admin).get(0).snapshot().contains("A"));
        assertEquals(1, count("stock_doc"));
    }

    @Test
    void balanceIsIssuedMinusReturnedPerTechnicianAndPart() {
        long a = insertPart("A");
        make(StockDoc.Type.ZAD, 2, a, "5", admin);
        make(StockDoc.Type.RAZ, 2, a, "2", admin);
        make(StockDoc.Type.ZAD, 3, a, "1", admin);

        List<BalanceRow> rows = service.balance(null, null, null, null, admin);
        assertEquals(2, rows.size());
        BalanceRow two = rows.stream().filter(r -> r.technicianId() == 2).findFirst().orElseThrow();
        assertEquals(0, new BigDecimal("3").compareTo(two.closing()));
        assertEquals(0, new BigDecimal("5").compareTo(two.issued()));
        assertEquals(0, new BigDecimal("2").compareTo(two.returned()));
    }

    @Test
    void onlyTechniciansCanBeIssuedTo() {
        long a = insertPart("A");
        assertEquals(400, assertThrows(NalogException.class, () -> make(StockDoc.Type.ZAD, 4, a, "1", admin)).getStatus().value());
        assertEquals(0, count("stock_doc"));
    }
}
