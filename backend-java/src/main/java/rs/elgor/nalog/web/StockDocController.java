package rs.elgor.nalog.web;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import rs.elgor.nalog.domain.StockDoc;
import rs.elgor.nalog.dto.PageResponse;
import rs.elgor.nalog.dto.StockDocDtos.*;
import rs.elgor.nalog.service.StockDocService;
import rs.elgor.nalog.service.UserDirectoryService;

import java.time.Instant;
import java.util.List;

/**
 * Zaduzenje / razduzenje documents. Admin-level creates and edits; a technician only reads his own.
 * There is deliberately no DELETE.
 */
@RestController
@RequestMapping("/api/stock-docs")
public class StockDocController {

    private final StockDocService service;
    private final UserDirectoryService directory;

    public StockDocController(StockDocService service, UserDirectoryService directory) {
        this.service = service;
        this.directory = directory;
    }

    @GetMapping
    public PageResponse<DocSummary> list(@RequestParam(required = false) StockDoc.Type type,
                                         @RequestParam(required = false) Long technicianId,
                                         @RequestParam(required = false) Instant from,
                                         @RequestParam(required = false) Instant to,
                                         @RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "30") int size,
                                         @AuthenticationPrincipal Jwt jwt) {
        return service.list(type, technicianId, from, to, page, size, directory.resolve(jwt));
    }

    /** Whole documents (all lines) for printing; oldest first. A technician only gets his own. */
    @GetMapping("/full")
    public List<DocView> full(@RequestParam(required = false) StockDoc.Type type,
                              @RequestParam(required = false) Long technicianId,
                              @RequestParam(required = false) Instant from,
                              @RequestParam(required = false) Instant to,
                              @AuthenticationPrincipal Jwt jwt) {
        return service.full(type, technicianId, from, to, directory.resolve(jwt));
    }

    /** Stanje materijala is a report: owner (admin account) only, a manager has no access to reports. */
    @GetMapping("/balance")
    @PreAuthorize("hasRole('OWNER')")
    public List<BalanceRow> balance(@RequestParam(required = false) Long technicianId,
                                    @RequestParam(required = false) Long partId,
                                    @RequestParam(required = false) Instant from,
                                    @RequestParam(required = false) Instant to,
                                    @AuthenticationPrincipal Jwt jwt) {
        return service.balance(technicianId, partId, from, to, directory.resolve(jwt));
    }

    @GetMapping("/{id}")
    public DocView get(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return service.get(id, directory.resolve(jwt));
    }

    @GetMapping("/{id}/revisions")
    @PreAuthorize("hasRole('ADMIN')")
    public List<RevisionView> revisions(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return service.revisions(id, directory.resolve(jwt));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<DocView> create(@Valid @RequestBody CreateRequest request, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.status(201).body(service.create(request, directory.resolve(jwt)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public DocView update(@PathVariable Long id, @Valid @RequestBody UpdateRequest request, @AuthenticationPrincipal Jwt jwt) {
        return service.update(id, request, directory.resolve(jwt));
    }
}
