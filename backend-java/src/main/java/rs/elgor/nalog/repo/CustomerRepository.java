package rs.elgor.nalog.repo;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import rs.elgor.nalog.domain.Customer;

import java.util.List;

public interface CustomerRepository extends JpaRepository<Customer, Long> {

    /** Autocomplete for the nalog form. pattern must be lower-case and wrapped in %...% */
    @Query("select c from Customer c where lower(c.fullName) like :pattern or c.phone like :pattern order by c.fullName")
    List<Customer> search(@Param("pattern") String pattern, Pageable pageable);
}
