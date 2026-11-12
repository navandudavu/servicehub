package rs.elgor.nalog;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The Menadzer role: admin powers everywhere except the Tim tab (accounts, roles, passwords). */
@AutoConfigureMockMvc
class ManagerRoleIntegrationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired JwtAuthenticationConverter converter;

    @BeforeEach
    void users() {
        insertUser(1, "Admin", "admin");
        insertUser(2, "Tehničar Dva", "technician");
        insertUser(4, "Menadžer", "manager");
    }

    /** Authorities exactly as the real converter builds them from the role claim. */
    private RequestPostProcessor as(long id, String name, String role) {
        Jwt token = Jwt.withTokenValue("t").header("alg", "none").claim("id", id).claim("name", name).claim("role", role).build();
        AbstractAuthenticationToken auth = converter.convert(token);
        return jwt().jwt(j -> j.claim("id", id).claim("name", name).claim("role", role)).authorities(auth.getAuthorities());
    }

    @Test
    void converterGivesTheTeamAuthorityToAdminsOnly() {
        assertTrue(authorities("admin").contains("ROLE_OWNER"));
        assertTrue(authorities("admin").contains("ROLE_ADMIN"));
        assertTrue(authorities("manager").contains("ROLE_ADMIN"));
        assertFalse(authorities("manager").contains("ROLE_OWNER"));
        assertFalse(authorities("technician").contains("ROLE_ADMIN"));
    }

    private java.util.Set<String> authorities(String role) {
        Jwt token = Jwt.withTokenValue("t").header("alg", "none").claim("role", role).build();
        java.util.Set<String> out = new java.util.HashSet<>();
        converter.convert(token).getAuthorities().forEach(a -> out.add(a.getAuthority()));
        return out;
    }

    @Test
    void managerCannotManageTheTeamButAdminCan() throws Exception {
        String json = MediaType.APPLICATION_JSON_VALUE;
        mvc.perform(post("/api/users").with(as(4, "Menadžer", "manager")).contentType(json)
                .content("{\"name\":\"X\",\"email\":\"x@x.rs\",\"password\":\"abcdefgh12\",\"role\":\"technician\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/users/2/active").with(as(4, "Menadžer", "manager")).contentType(json).content("{\"active\":false}"))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/users/2/reset-password").with(as(4, "Menadžer", "manager")).contentType(json).content("{\"newPassword\":\"abcdefgh12\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/users/2").with(as(4, "Menadžer", "manager")))
                .andExpect(status().isForbidden());

        mvc.perform(patch("/api/users/2/active").with(as(1, "Admin", "admin")).contentType(json).content("{\"active\":true}"))
                .andExpect(status().isOk());
    }

    @Test
    void managerReachesTheAdminOnlyEndpoints() throws Exception {
        mvc.perform(get("/api/nalozi/reports/summary").with(as(4, "Menadžer", "manager"))
                .param("from", "2026-01-01T00:00:00Z").param("to", "2026-02-01T00:00:00Z"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/nalozi/reports/summary").with(as(2, "Tehničar Dva", "technician"))
                .param("from", "2026-01-01T00:00:00Z").param("to", "2026-02-01T00:00:00Z"))
                .andExpect(status().isForbidden());
    }
}
