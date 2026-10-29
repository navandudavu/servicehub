package rs.elgor.nalog.web;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import rs.elgor.nalog.dto.PageResponse;
import rs.elgor.nalog.dto.PartDtos.*;
import rs.elgor.nalog.service.PartService;
import rs.elgor.nalog.service.UserDirectoryService;

@RestController
@RequestMapping("/api/parts")
public class PartController {

    private final PartService partService;
    private final UserDirectoryService directory;

    public PartController(PartService partService, UserDirectoryService directory) {
        this.partService = partService;
        this.directory = directory;
    }

    /** Inventory lookup for the nalog form. Technicians may search; they may not edit. */
    @GetMapping
    public PageResponse<PartResponse> search(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "true") boolean onlyActive,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return partService.search(q, onlyActive, page, size);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PartResponse> create(@Valid @RequestBody CreatePartRequest request,
                                               @AuthenticationPrincipal Jwt jwt) {
        PartResponse created = partService.create(request, directory.resolve(jwt));
        return ResponseEntity.created(ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(created.id()).toUri()).body(created);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public PartResponse update(@PathVariable Long id, @Valid @RequestBody UpdatePartRequest request) {
        return partService.update(id, request);
    }

    @PostMapping("/{id}/stock")
    @PreAuthorize("hasRole('ADMIN')")
    public PartResponse adjustStock(@PathVariable Long id,
                                    @Valid @RequestBody StockAdjustRequest request,
                                    @AuthenticationPrincipal Jwt jwt) {
        return partService.adjustStock(id, request, directory.resolve(jwt));
    }
}
