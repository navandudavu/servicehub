package rs.elgor.nalog;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class PartsAndNotesIntegrationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @BeforeEach
    void users() {
        insertUser(1, "Admin", "admin");
        insertUser(2, "Tehničar Dva", "technician");
        insertUser(3, "Tehničar Tri", "technician");
    }

    private RequestPostProcessor as(long id, String name, String role) {
        return jwt().jwt(j -> j.claim("id", id).claim("name", name).claim("role", role))
                .authorities(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase()));
    }
    private RequestPostProcessor admin() { return as(1, "Admin", "admin"); }
    private RequestPostProcessor tech2() { return as(2, "Tehničar Dva", "technician"); }
    private RequestPostProcessor tech3() { return as(3, "Tehničar Tri", "technician"); }

    private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

    // ------------------------------------------------------------------ parts

    private long createPart(String sku, int stock) throws Exception {
        String body = mvc.perform(post("/api/parts").with(admin()).contentType(JSON)
                        .content("{\"sku\":\"" + sku + "\",\"name\":\"Filter " + sku + "\",\"unitPrice\":\"12.50\",\"stockQty\":" + stock + "}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.id")).longValue();
    }

    @Test
    void duplicateSkuIsAConflictAndTechniciansCannotCreateParts() throws Exception {
        createPart("A1", 3);
        mvc.perform(post("/api/parts").with(admin()).contentType(JSON)
                .content("{\"sku\":\"A1\",\"name\":\"Again\",\"unitPrice\":\"1.00\",\"stockQty\":0}"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/parts").with(tech2()).contentType(JSON)
                .content("{\"sku\":\"B2\",\"name\":\"Nope\",\"unitPrice\":\"1.00\",\"stockQty\":0}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void techniciansCanSearchPartsForTheNalogForm() throws Exception {
        createPart("A1", 3);
        mvc.perform(get("/api/parts").with(tech2()).param("q", "filter"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].unitPrice", is("12.50")));
    }

    @Test
    void stockHistoryIsNewestFirstAndAdminOnly() throws Exception {
        long id = createPart("A1", 3);
        mvc.perform(post("/api/parts/" + id + "/stock").with(admin()).contentType(JSON)
                .content("{\"delta\":5,\"note\":\"delivery\"}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.stockQty", is(8)));

        mvc.perform(get("/api/parts/" + id + "/movements").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].delta", is(5)))
                .andExpect(jsonPath("$[0].reason", is("MANUAL")))
                .andExpect(jsonPath("$[0].note", is("delivery")))
                .andExpect(jsonPath("$[0].actorName", is("Admin")))
                .andExpect(jsonPath("$[1].reason", is("INITIAL")));

        mvc.perform(get("/api/parts/" + id + "/movements").with(tech2())).andExpect(status().isForbidden());
        mvc.perform(get("/api/parts/99999/movements").with(admin())).andExpect(status().isNotFound());
    }

    @Test
    void stockCannotGoBelowZero() throws Exception {
        long id = createPart("A1", 2);
        mvc.perform(post("/api/parts/" + id + "/stock").with(admin()).contentType(JSON)
                .content("{\"delta\":-3}")).andExpect(status().isConflict());
        org.junit.jupiter.api.Assertions.assertEquals(2, stockOf(id));
        org.junit.jupiter.api.Assertions.assertEquals(1, count("stock_movement"));   // only the INITIAL row
    }

    // ------------------------------------------------------------------ notes

    private long createNalog(Long assignTo) throws Exception {
        String body = """
            {"newCustomer":{"fullName":"Petar Petrović","address":"Cara Lazara 1","city":"Kruševac","phone":"060 123 456"},
             "appliance":{"type":"%s","brand":"Gorenje"},
             "diagnosis":"Ne hladi","laborHours":"1.00","paymentType":"%s"%s}
            """.formatted(rs.elgor.nalog.domain.ApplianceType.values()[0], rs.elgor.nalog.domain.PaymentType.values()[0],
                assignTo == null ? "" : ",\"assignedToId\":" + assignTo);
        String res = mvc.perform(post("/api/nalozi").with(admin()).contentType(JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(res, "$.id")).longValue();
    }

    private String note(String text) { return "{\"body\":\"" + text + "\"}"; }

    @Test
    void assignedTechnicianCanAddAndReadNotesInOrder() throws Exception {
        long n = createNalog(2L);
        mvc.perform(post("/api/nalozi/" + n + "/notes").with(tech2()).contentType(JSON).content(note("Prvi")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.authorName", is("Tehničar Dva")));
        mvc.perform(post("/api/nalozi/" + n + "/notes").with(admin()).contentType(JSON).content(note("Drugi")))
                .andExpect(status().isCreated());

        mvc.perform(get("/api/nalozi/" + n + "/notes").with(tech2()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].body", is("Prvi")))
                .andExpect(jsonPath("$[1].body", is("Drugi")));
    }

    @Test
    void aTechnicianCannotTouchNotesOfSomeoneElsesNalog() throws Exception {
        long n = createNalog(2L);
        mvc.perform(get("/api/nalozi/" + n + "/notes").with(tech3())).andExpect(status().isNotFound());
        mvc.perform(post("/api/nalozi/" + n + "/notes").with(tech3()).contentType(JSON).content(note("x")))
                .andExpect(status().isNotFound());
        org.junit.jupiter.api.Assertions.assertEquals(0, count("nalog_note"));
    }

    @Test
    void blankAndOversizedNotesAreRejected() throws Exception {
        long n = createNalog(2L);
        mvc.perform(post("/api/nalozi/" + n + "/notes").with(tech2()).contentType(JSON).content(note("   ")))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/nalozi/" + n + "/notes").with(tech2()).contentType(JSON).content(note("x".repeat(2001))))
                .andExpect(status().isBadRequest());
        org.junit.jupiter.api.Assertions.assertEquals(0, count("nalog_note"));
    }

    @Test
    void onlyAdminDeletesNotes() throws Exception {
        long n = createNalog(2L);
        String res = mvc.perform(post("/api/nalozi/" + n + "/notes").with(tech2()).contentType(JSON).content(note("Greška")))
                .andReturn().getResponse().getContentAsString();
        long noteId = ((Number) JsonPath.read(res, "$.id")).longValue();

        mvc.perform(delete("/api/nalozi/" + n + "/notes/" + noteId).with(tech2())).andExpect(status().isForbidden());
        mvc.perform(delete("/api/nalozi/" + n + "/notes/" + noteId).with(admin())).andExpect(status().isNoContent());
        mvc.perform(get("/api/nalozi/" + n + "/notes").with(admin())).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(delete("/api/nalozi/" + n + "/notes/" + noteId).with(admin())).andExpect(status().isNotFound());
    }

    @Test
    void notesStillWorkOnACancelledNalog() throws Exception {
        long n = createNalog(2L);
        mvc.perform(patch("/api/nalozi/" + n + "/status").with(admin()).contentType(JSON).content("{\"status\":\"CANCELLED\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/nalozi/" + n + "/notes").with(admin()).contentType(JSON).content(note("Klijent otkazao")))
                .andExpect(status().isCreated());
    }
}
