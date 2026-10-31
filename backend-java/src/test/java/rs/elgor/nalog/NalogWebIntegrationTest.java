package rs.elgor.nalog;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class NalogWebIntegrationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @BeforeEach
    void users() {
        insertUser(1, "Admin", "admin");
        insertUser(2, "Tehničar Dva", "technician");
    }

    private RequestPostProcessor as(long id, String name, String role) {
        return jwt().jwt(j -> j.claim("id", id).claim("name", name).claim("role", role))
                .authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + role.toUpperCase()));
    }
    private RequestPostProcessor admin() { return as(1, "Admin", "admin"); }
    private RequestPostProcessor tech() { return as(2, "Tehničar Dva", "technician"); }

    private static final String VALID = """
        {"newCustomer":{"fullName":"Petar Petrović","address":"Cara Lazara 1","city":"Kruševac","phone":"060 123 456"},
         "appliance":{"type":"%s","brand":"Gorenje"},
         "diagnosis":"Ne hladi","laborHours":"1.50","paymentType":"%s"}
        """;

    private String valid() {
        return VALID.formatted(rs.elgor.nalog.domain.ApplianceType.values()[0], rs.elgor.nalog.domain.PaymentType.values()[0]);
    }

    @Test
    void noTokenIs401() throws Exception {
        mvc.perform(get("/api/nalozi")).andExpect(status().isUnauthorized());
    }

    @Test
    void createReturns201WithMoneyAsStrings() throws Exception {
        mvc.perform(post("/api/nalozi").with(admin()).contentType(MediaType.APPLICATION_JSON).content(valid()))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.total", is("4500.00")))        // 3750 + 20% VAT = 4500
                .andExpect(jsonPath("$.status", is("DRAFT")));
    }

    @Test
    void clientCannotSmuggleInAPrice() throws Exception {
        String evil = valid().replace("\"diagnosis\"", "\"total\":\"1.00\",\"diagnosis\"");
        mvc.perform(post("/api/nalozi").with(admin()).contentType(MediaType.APPLICATION_JSON).content(evil))
                .andExpect(status().isBadRequest());
    }

    @Test
    void validationErrorsComeBackAsAFieldMap() throws Exception {
        String bad = valid().replace("060 123 456", "abc");
        mvc.perform(post("/api/nalozi").with(admin()).contentType(MediaType.APPLICATION_JSON).content(bad))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['newCustomer.phone']", notNullValue()));
    }

    @Test
    void technicianGets403NotAnErrorOnAdminEndpoints() throws Exception {
        mvc.perform(patch("/api/nalozi/1/assign").with(tech()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"technicianId\":2}")).andExpect(status().isForbidden());
        mvc.perform(get("/api/nalozi/reports/summary").with(tech())
                .param("from", "2026-01-01T00:00:00Z").param("to", "2027-01-01T00:00:00Z"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/nalozi/reports/export.csv").with(tech())
                .param("from", "2026-01-01T00:00:00Z").param("to", "2027-01-01T00:00:00Z"))
                .andExpect(status().isForbidden());
    }

    @Test
    void reportsSumTheStoredAmountsAndCsvExportWorks() throws Exception {
        for (int i = 0; i < 2; i++) {
            String body = mvc.perform(post("/api/nalozi").with(admin()).contentType(MediaType.APPLICATION_JSON).content(valid()))
                    .andReturn().getResponse().getContentAsString();
            long id = ((Number) com.jayway.jsonpath.JsonPath.read(body, "$.id")).longValue();
            for (String s : new String[]{"DISPATCHED", "IN_PROGRESS", "COMPLETED"}) {
                mvc.perform(patch("/api/nalozi/" + id + "/status").with(admin())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"" + s + "\"}"))
                        .andExpect(status().isOk());
            }
        }
        String from = java.time.Instant.now().minusSeconds(3600).toString();
        String to = java.time.Instant.now().plusSeconds(3600).toString();

        mvc.perform(get("/api/nalozi/reports/summary").with(admin()).param("from", from).param("to", to))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totals.count", is(2)))
                .andExpect(jsonPath("$.totals.total", is("9000.00")))
                .andExpect(jsonPath("$.byMonth", hasSize(1)));

        mvc.perform(get("/api/nalozi/reports/export.csv").with(admin()).param("from", from).param("to", to))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("N-")));
    }

    @Test
    void calendarAndStatsWorkAgainstRealPostgres() throws Exception {
        mvc.perform(post("/api/nalozi").with(admin()).contentType(MediaType.APPLICATION_JSON).content(valid()))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/nalozi/stats").with(admin())).andExpect(status().isOk());
        mvc.perform(get("/api/nalozi/stats").with(tech())).andExpect(status().isOk());
        mvc.perform(get("/api/nalozi/calendar").with(admin())
                .param("from", "2026-01-01T00:00:00Z").param("to", "2027-01-01T00:00:00Z"))
                .andExpect(status().isOk());
    }
}
