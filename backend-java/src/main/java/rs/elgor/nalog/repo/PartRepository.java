package rs.elgor.nalog.repo;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import rs.elgor.nalog.domain.Part;

import java.util.Optional;

public interface PartRepository extends JpaRepository<Part, Long> {

    boolean existsBySku(String sku);

    Optional<Part> findBySku(String sku);

    /** pattern must already be lower-case and wrapped in %...% */
    @Query("select p from Part p where (:onlyActive = false or p.active = true) "
         + "and (lower(p.name) like :pattern or lower(p.sku) like :pattern)")
    Page<Part> search(@Param("pattern") String pattern, @Param("onlyActive") boolean onlyActive, Pageable pageable);
}
