package rs.elgor.nalog;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.domain.NalogStatus;
import rs.elgor.nalog.domain.PaymentType;
import rs.elgor.nalog.domain.StockDoc;
import rs.elgor.nalog.dto.CreateNalogRequest;
import rs.elgor.nalog.dto.CreateNalogRequest.ApplianceInput;
import rs.elgor.nalog.dto.CreateNalogRequest.CustomerInput;
import rs.elgor.nalog.dto.NalogResponse;
import rs.elgor.nalog.dto.StockDocDtos.*;
import rs.elgor.nalog.service.NalogException;
import rs.elgor.nalog.service.NalogMaterialService;
import rs.elgor.nalog.service.NalogService;
import rs.elgor.nalog.service.StockDocService;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Materijal on a nalog (automatic Razduzenje) and the read-only archive of a reassigned nalog. */
class MaterialArchiveIntegrationTest extends AbstractIntegrationTest {

    @Autowired NalogService nalozi;
    @Autowired NalogMaterialService material;
    @Autowired StockDocService stock;

    AuthUser admin = new AuthUser(1, "Admin", "admin");
    AuthUser tech2 = new AuthUser(2, "Tehničar Dva", "technician");
    AuthUser tech3 = new AuthUser(3, "Tehničar Tri", "technician");

    @BeforeEach
    void users() {
        insertUser(1, "Admin", "admin");
        insertUser(2, "Tehničar Dva", "technician");
        insertUser(3, "Tehničar Tri", "technician");
    }

    private NalogResponse nalogFor(long tech) {
        return nalozi.create(new CreateNalogRequest(null,
                new CustomerInput("Petar Petrović", "Cara Lazara 1", "Kruševac", "060 123 456", null, null),
                new ApplianceInput("AIR_CONDITIONER", "Gorenje", "X1", "SN1"),
                "Ne hladi", new BigDecimal("1.50"), new BigDecimal("8000.00"), PaymentType.values()[0],
                NalogStatus.DISPATCHED, null, tech), null, admin);
    }

    private void zaduzi(long tech, long part, String qty) {
        stock.create(new CreateRequest(StockDoc.Type.ZAD, tech, null, List.of(new LineRequest(part, new BigDecimal(qty)))), admin);
    }

    @Test
    void materialIsARazduzenjeLimitedToWhatTheTechnicianHolds() {
        long part = insertPart("A");
        NalogResponse n = nalogFor(2);
        zaduzi(2, part, "3");

        assertEquals(1, stock.heldParts(2L, null, tech2).size());
        assertEquals(0, stock.heldParts(3L, null, admin).size());

        List<MaterialLine> lines = material.add(n.id(), new MaterialRequest(List.of(new LineRequest(part, new BigDecimal("2")))), tech2);
        assertEquals(1, lines.size());
        assertEquals(1, count("stock_doc WHERE doc_type = 'RAZ' AND nalog_id IS NOT NULL"));

        // 2 of 3 are used, so 2 more is too much; 1 more is fine
        assertEquals(400, assertThrows(NalogException.class,
                () -> material.add(n.id(), new MaterialRequest(List.of(new LineRequest(part, new BigDecimal("2")))), tech2)).getStatus().value());
        assertEquals(2, material.add(n.id(), new MaterialRequest(List.of(new LineRequest(part, BigDecimal.ONE))), tech2).size());
        assertEquals(0, stock.heldParts(2L, null, tech2).size());      // nothing left, so it is no longer in his list
    }

    @Test
    void onlyAdminLevelUsersChangeOrRemoveMaterial() {
        long part = insertPart("A");
        NalogResponse n = nalogFor(2);
        zaduzi(2, part, "3");
        MaterialLine line = material.add(n.id(), new MaterialRequest(List.of(new LineRequest(part, BigDecimal.ONE))), tech2).get(0);

        assertEquals(403, assertThrows(NalogException.class,
                () -> material.changeQuantity(n.id(), line.lineId(), new BigDecimal("2"), tech2)).getStatus().value());
        assertEquals(403, assertThrows(NalogException.class, () -> material.remove(n.id(), line.lineId(), tech2)).getStatus().value());

        assertEquals(new BigDecimal("2.000"), material.changeQuantity(n.id(), line.lineId(), new BigDecimal("2"), admin).get(0).quantity());
        assertEquals(400, assertThrows(NalogException.class,
                () -> material.changeQuantity(n.id(), line.lineId(), new BigDecimal("9"), admin)).getStatus().value());   // more than he holds
        assertEquals(0, material.remove(n.id(), line.lineId(), admin).size());
        assertEquals(2, count("stock_doc_revision"));                                   // both changes kept the old version
        assertEquals(1, count("stock_doc WHERE doc_type = 'RAZ'"));                      // the document itself is never deleted
    }

    @Test
    void aTechnicianTheNalogWasTakenAwayFromKeepsAReadOnlyArchive() {
        NalogResponse n = nalogFor(2);
        nalozi.assign(n.id(), 3L, admin);

        // read: yes, with the whole timeline
        assertEquals(n.id(), nalozi.get(n.id(), tech2).id());
        assertTrue(nalozi.timeline(n.id(), tech2).stream().anyMatch(e -> e.kind().equals("ASSIGN")));
        assertEquals(1, nalozi.list(null, null, null, null, null, true, 0, 20, tech2).items().size());
        assertEquals(0, nalozi.list(null, null, null, null, null, false, 0, 20, tech2).items().size());
        assertEquals(0, nalozi.list(null, null, null, null, null, true, 0, 20, tech3).items().size());

        // write: no
        assertEquals(404, assertThrows(NalogException.class,
                () -> nalozi.changeStatus(n.id(), NalogStatus.IN_PROGRESS, null, tech2)).getStatus().value());
        assertEquals(404, assertThrows(NalogException.class,
                () -> material.add(n.id(), new MaterialRequest(List.of(new LineRequest(1L, BigDecimal.ONE))), tech2)).getStatus().value());

        // and a technician who never had it sees nothing at all
        assertEquals(404, assertThrows(NalogException.class, () -> nalozi.timeline(n.id(), new AuthUser(9, "Drugi", "technician"))).getStatus().value());
    }

    @Test
    void managerHasNoAccessToMaterial() {
        insertUser(4, "Menadžer", "manager");
        AuthUser manager = new AuthUser(4, "Menadžer", "manager");
        NalogResponse n = nalogFor(2);
        assertEquals(403, assertThrows(NalogException.class, () -> material.list(n.id(), manager)).getStatus().value());
        assertEquals(403, assertThrows(NalogException.class,
                () -> material.add(n.id(), new MaterialRequest(List.of(new LineRequest(insertPart("M"), BigDecimal.ONE))), manager)).getStatus().value());
    }
}
