package rs.elgor.nalog.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import rs.elgor.nalog.service.ApplianceTypeService;
import rs.elgor.nalog.service.UserDirectoryService;

import java.util.List;

/** The device-type dropdown. Anyone signed in reads it; admin-level adds a type ("Dodaj novi uredjaj"). */
@RestController
@RequestMapping("/api/appliance-types")
public class ApplianceTypeController {

    public record AddRequest(@NotBlank @Size(max = 100) String name) {}

    private final ApplianceTypeService service;
    private final UserDirectoryService directory;

    public ApplianceTypeController(ApplianceTypeService service, UserDirectoryService directory) {
        this.service = service;
        this.directory = directory;
    }

    @GetMapping
    public List<String> list() {
        return service.list();
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<String> add(@Valid @RequestBody AddRequest request, @AuthenticationPrincipal Jwt jwt) {
        return service.add(request.name(), directory.resolve(jwt));
    }
}
