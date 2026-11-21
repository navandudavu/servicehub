package rs.elgor.nalog.web;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import rs.elgor.nalog.dto.StockDocDtos.MaterialLine;
import rs.elgor.nalog.dto.StockDocDtos.MaterialQtyRequest;
import rs.elgor.nalog.dto.StockDocDtos.MaterialRequest;
import rs.elgor.nalog.service.NalogMaterialService;
import rs.elgor.nalog.service.UserDirectoryService;

import java.util.List;

/** Materijal of a nalog (= automatic Razduzenje). Everybody who may read the nalog may read it; the rules for writing are in the service. */
@RestController
@RequestMapping("/api/nalozi/{nalogId}/material")
public class NalogMaterialController {

    private final NalogMaterialService service;
    private final UserDirectoryService directory;

    public NalogMaterialController(NalogMaterialService service, UserDirectoryService directory) {
        this.service = service;
        this.directory = directory;
    }

    @GetMapping
    public List<MaterialLine> list(@PathVariable Long nalogId, @AuthenticationPrincipal Jwt jwt) {
        return service.list(nalogId, directory.resolve(jwt));
    }

    @PostMapping
    public List<MaterialLine> add(@PathVariable Long nalogId, @Valid @RequestBody MaterialRequest request, @AuthenticationPrincipal Jwt jwt) {
        return service.add(nalogId, request, directory.resolve(jwt));
    }

    @PutMapping("/{lineId}")
    public List<MaterialLine> change(@PathVariable Long nalogId, @PathVariable Long lineId,
                                     @Valid @RequestBody MaterialQtyRequest request, @AuthenticationPrincipal Jwt jwt) {
        return service.changeQuantity(nalogId, lineId, request.quantity(), directory.resolve(jwt));
    }

    @DeleteMapping("/{lineId}")
    public List<MaterialLine> remove(@PathVariable Long nalogId, @PathVariable Long lineId, @AuthenticationPrincipal Jwt jwt) {
        return service.remove(nalogId, lineId, directory.resolve(jwt));
    }
}
