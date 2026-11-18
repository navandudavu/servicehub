package rs.elgor.nalog.web;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import rs.elgor.nalog.dto.BulkDtos;
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

    /** Magacin list and search. Admin-level only: technicians do not use the Magacin, they only read their own documents. */
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
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
        PartResponse created = partService.create(request);
        return ResponseEntity.created(ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(created.id()).toUri()).body(created);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public PartResponse update(@PathVariable Long id, @Valid @RequestBody UpdatePartRequest request) {
        return partService.update(id, request);
    }

    /** Admin only, all or nothing: activate or deactivate a selection of parts. */
    @PostMapping("/bulk-active")
    @PreAuthorize("hasRole('ADMIN')")
    public BulkDtos.BulkResult bulkActive(@Valid @RequestBody BulkDtos.BulkActive request) {
        return new BulkDtos.BulkResult(partService.setActiveMany(request.ids(), request.active()));
    }

    /** Admin only: CSV text (sifra;naziv;jedinica mere) exported from BiznisSOFT, as the request body. */
    @PostMapping(value = "/import", consumes = {"text/csv", "text/plain"})
    @PreAuthorize("hasRole('ADMIN')")
    public ImportResult importCsv(@RequestBody String csv) {
        return partService.importCsv(csv);
    }
}
