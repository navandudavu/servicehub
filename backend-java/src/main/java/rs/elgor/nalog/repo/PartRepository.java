package rs.elgor.nalog.repo;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import rs.elgor.nalog.domain.Part;

import java.util.Collection;
import java.util.List;

public interface PartRepository extends JpaRepository<Part, Long> {

    /**
     * SELECT ... FOR UPDATE. Two technicians grabbing the last compressor at the
     * same moment are serialised by the DB: the second one sees the already-reduced
     * stock and gets a clean 409 instead of driving stock negative.
     * ORDER BY id gives every transaction the same lock order -> no deadlocks.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Part p where p.id in :ids order by p.id")
    List<Part> findAllByIdForUpdate(@Param("ids") Collection<Long> ids);

    boolean existsBySku(String sku);

    /** pattern must already be lower-case and wrapped in %...% */
    @Query("select p from Part p where (:onlyActive = false or p.active = true) "
         + "and (lower(p.name) like :pattern or lower(p.sku) like :pattern)")
    Page<Part> search(@Param("pattern") String pattern, @Param("onlyActive") boolean onlyActive, Pageable pageable);
}
