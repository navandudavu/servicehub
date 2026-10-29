package rs.elgor.nalog.web;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import rs.elgor.nalog.domain.NalogStatus;
import rs.elgor.nalog.dto.*;
import rs.elgor.nalog.service.NalogException;
import rs.elgor.nalog.service.NalogService;
import rs.elgor.nalog.service.UserDirectoryService;
import org.springframework.security.access.prepost.PreAuthorize;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/nalozi")
public class NalogController {

    private final NalogService nalogService;
    private final UserDirectoryService directory;

    public NalogController(NalogService nalogService, UserDirectoryService directory) {
        this.nalogService = nalogService;
        this.directory = directory;
    }

    /**
     * Thin on purpose: validation (@Valid) runs before the transaction opens; the
     * transaction itself lives on NalogService (RULE B), so the boundary is identical
     * no matter who calls the service (REST, import job, test).
     *
     * Idempotency-Key: generated once per form by the client, re-sent unchanged on retries.
     */
    @PostMapping
    public ResponseEntity<NalogResponse> create(
            @Valid @RequestBody CreateNalogRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @AuthenticationPrincipal Jwt jwt) {

        if (idempotencyKey != null && (idempotencyKey.isBlank() || idempotencyKey.length() > 80)) {
            throw NalogException.invalid("Idempotency-Key must be 1-80 characters");
        }
        NalogResponse created = nalogService.create(request, idempotencyKey, directory.resolve(jwt));
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(created.id()).toUri();
        return ResponseEntity.created(location).body(created);
    }

    /** "What would this cost?" - backend maths, nothing saved. */
    @PostMapping("/preview")
    public NalogPreview preview(@Valid @RequestBody PreviewRequest request) {
        return nalogService.preview(request);
    }

    @GetMapping
    public PageResponse<NalogSummary> list(
            @RequestParam(required = false) NalogStatus status,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long assignedTo,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal Jwt jwt) {
        return nalogService.list(status, q, assignedTo, page, size, directory.resolve(jwt));
    }

    @GetMapping("/{id}")
    public NalogResponse get(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return nalogService.get(id, directory.resolve(jwt));
    }

    @GetMapping("/{id}/history")
    public List<StatusHistoryView> history(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return nalogService.history(id, directory.resolve(jwt));
    }

    /** Transition rules and the admin-only cancel are enforced in the service. */
    @PatchMapping("/{id}/status")
    public NalogResponse changeStatus(@PathVariable Long id,
                                      @Valid @RequestBody ChangeStatusRequest request,
                                      @AuthenticationPrincipal Jwt jwt) {
        return nalogService.changeStatus(id, request.status(), directory.resolve(jwt));
    }

    /** Admin only. {"technicianId": 3} assigns, {"technicianId": null} un-assigns. */
    @PatchMapping("/{id}/assign")
    @PreAuthorize("hasRole('ADMIN')")
    public NalogResponse assign(@PathVariable Long id, @RequestBody AssignRequest request,
                                @AuthenticationPrincipal Jwt jwt) {
        return nalogService.assign(id, request.technicianId(), directory.resolve(jwt));
    }

    /** Customer autocomplete for the new-nalog form. */
    @GetMapping("/customers")
    public List<NalogResponse.CustomerView> customers(@RequestParam(required = false) String q) {
        return nalogService.searchCustomers(q);
    }

    /** Admin only. Pushes the Node team list in, so every technician is assignable without having logged in first. */
    @PostMapping("/users/sync")
    @PreAuthorize("hasRole('ADMIN')")
    public java.util.Map<String, Integer> syncUsers(@RequestBody @Valid List<UserSyncItem> users) {
        return java.util.Map.of("synced", directory.sync(users));
    }

    /** For the admin's "assign to..." dropdown. */
    @GetMapping("/technicians")
    @PreAuthorize("hasRole('ADMIN')")
    public List<TechnicianView> technicians() {
        return nalogService.technicians();
    }
}
