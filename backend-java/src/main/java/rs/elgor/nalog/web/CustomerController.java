package rs.elgor.nalog.web;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import rs.elgor.nalog.dto.BulkDtos;
import rs.elgor.nalog.dto.CustomerDtos.*;
import rs.elgor.nalog.dto.NalogResponse.CustomerView;
import rs.elgor.nalog.service.CustomerService;
import rs.elgor.nalog.service.UserDirectoryService;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/customers")
public class CustomerController {

    private final CustomerService customers;
    private final UserDirectoryService directory;

    public CustomerController(CustomerService customers, UserDirectoryService directory) {
        this.customers = customers;
        this.directory = directory;
    }

    @GetMapping
    public List<CustomerView> list(@RequestParam(required = false) String q) {
        return customers.list(q);
    }

    @GetMapping("/{id}")
    public CustomerDetail get(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return customers.get(id, directory.resolve(jwt));
    }

    @PostMapping
    public ResponseEntity<CustomerView> create(@Valid @RequestBody CustomerRequest request) {
        CustomerView created = customers.create(request);
        return ResponseEntity.created(ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(created.id()).toUri()).body(created);
    }

    @PutMapping("/{id}")
    public CustomerView update(@PathVariable Long id, @Valid @RequestBody CustomerRequest request) {
        return customers.update(id, request);
    }

    /** Admin only (checked in the service). Customers with nalozi are skipped and listed in the answer. */
    @PostMapping("/bulk-delete")
    public BulkDtos.BulkCustomerDelete bulkDelete(@Valid @RequestBody BulkDtos.BulkIds request, @AuthenticationPrincipal Jwt jwt) {
        return customers.deleteMany(request.ids(), directory.resolve(jwt));
    }

    /** Admin only (checked in the service); refused with 409 when the customer has nalozi. */
    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        customers.delete(id, directory.resolve(jwt));
        return Map.of("ok", true);
    }
}
