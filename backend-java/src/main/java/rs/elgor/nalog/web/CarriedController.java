package rs.elgor.nalog.web;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import rs.elgor.nalog.dto.CarriedDtos.CarriedRequest;
import rs.elgor.nalog.dto.CarriedDtos.CarriedView;
import rs.elgor.nalog.service.CarriedItemService;
import rs.elgor.nalog.service.UserDirectoryService;

import java.util.List;
import java.util.Map;

/** Zaduzivanje. Access rules live in CarriedItemService (a technician only ever touches his own list). */
@RestController
@RequestMapping("/api/carried")
public class CarriedController {

    private final CarriedItemService service;
    private final UserDirectoryService directory;

    public CarriedController(CarriedItemService service, UserDirectoryService directory) {
        this.service = service;
        this.directory = directory;
    }

    @GetMapping
    public List<CarriedView> list(@RequestParam(required = false) Long technicianId, @AuthenticationPrincipal Jwt jwt) {
        return service.list(technicianId, directory.resolve(jwt));
    }

    @PostMapping
    public ResponseEntity<CarriedView> add(@Valid @RequestBody CarriedRequest request, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.status(201).body(service.add(request, directory.resolve(jwt)));
    }

    @PutMapping("/{id}")
    public CarriedView update(@PathVariable Long id, @Valid @RequestBody CarriedRequest request, @AuthenticationPrincipal Jwt jwt) {
        return service.update(id, request, directory.resolve(jwt));
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        service.delete(id, directory.resolve(jwt));
        return Map.of("ok", true);
    }
}
