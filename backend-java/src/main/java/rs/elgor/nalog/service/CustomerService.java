package rs.elgor.nalog.service;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.domain.Customer;
import rs.elgor.nalog.domain.Nalog;
import rs.elgor.nalog.dto.CustomerDtos.*;
import rs.elgor.nalog.dto.NalogResponse.CustomerView;
import rs.elgor.nalog.repo.CustomerRepository;
import rs.elgor.nalog.repo.NalogRepository;

import java.util.List;
import java.util.Objects;

/**
 * The customer list. There is ONE customer table (the nalog form and this page share it).
 * Everybody logged in may list, create and edit (technicians create customers on site); only an admin deletes,
 * and a customer with nalozi can never be deleted (the nalozi are accounting history).
 * A technician sees only their own nalozi in a customer's history, like everywhere else.
 */
@Service
public class CustomerService {

    private static final int LIST_LIMIT = 500;

    private final CustomerRepository customers;
    private final NalogRepository nalozi;

    public CustomerService(CustomerRepository customers, NalogRepository nalozi) {
        this.customers = customers;
        this.nalozi = nalozi;
    }

    @Transactional(readOnly = true)
    public List<CustomerView> list(String q) {
        String cleaned = q == null ? "" : q.trim().toLowerCase().replace("%", "").replace("_", "");
        List<Customer> found = cleaned.isEmpty()
                ? customers.findAllByOrderByFullNameAsc(PageRequest.of(0, LIST_LIMIT))
                : customers.search("%" + cleaned + "%", PageRequest.of(0, LIST_LIMIT));
        return found.stream().map(CustomerService::view).toList();
    }

    @Transactional(readOnly = true)
    public CustomerDetail get(Long id, AuthUser actor) {
        Customer c = load(id);
        List<CustomerNalog> history = nalozi.findTop200ByCustomerIdOrderByCreatedAtDescIdDesc(id).stream()
                .filter(n -> actor.isAdmin()
                        || Objects.equals(n.getAssignedToId(), actor.id())
                        || Objects.equals(n.getCreatedById(), actor.id()))
                .map(CustomerService::line)
                .toList();
        return new CustomerDetail(view(c), history);
    }

    @Transactional(rollbackFor = Exception.class)
    public CustomerView create(CustomerRequest r) {
        Customer c = new Customer();
        apply(c, r);
        return view(customers.saveAndFlush(c));
    }

    @Transactional(rollbackFor = Exception.class)
    public CustomerView update(Long id, CustomerRequest r) {
        Customer c = load(id);
        apply(c, r);
        return view(customers.saveAndFlush(c));
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id, AuthUser actor) {
        if (!actor.isAdmin()) {
            throw NalogException.forbidden("Only an admin can delete a customer");
        }
        Customer c = load(id);
        if (nalozi.existsByCustomerId(id)) {
            throw NalogException.conflict("This customer has nalozi and cannot be deleted.");
        }
        customers.delete(c);
        customers.flush();
    }

    // ---- helpers -----------------------------------------------------------

    private Customer load(Long id) {
        return customers.findById(id).orElseThrow(() -> NalogException.notFound("Customer " + id + " not found"));
    }

    private static void apply(Customer c, CustomerRequest r) {
        c.setFullName(r.fullName().trim());
        c.setAddress(r.address().trim());
        c.setCity(blankToNull(r.city()));
        c.setPhone(r.phone().trim());
        c.setEmail(blankToNull(r.email()));
        c.setLocationNotes(blankToNull(r.locationNotes()));
    }

    private static CustomerView view(Customer c) {
        return new CustomerView(c.getId(), c.getFullName(), c.getAddress(), c.getCity(),
                c.getPhone(), c.getEmail(), c.getLocationNotes());
    }

    private static CustomerNalog line(Nalog n) {
        return new CustomerNalog(n.getId(), n.getNalogNumber(), n.getStatus(), n.getCreatedAt(),
                n.getApplianceType(), n.getApplianceBrand(), n.getApplianceModel(), n.getTotal());
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}
