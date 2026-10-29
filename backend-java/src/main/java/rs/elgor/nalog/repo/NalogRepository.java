package rs.elgor.nalog.repo;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import rs.elgor.nalog.domain.Nalog;

import java.util.Optional;

public interface NalogRepository extends JpaRepository<Nalog, Long>, JpaSpecificationExecutor<Nalog> {

    Optional<Nalog> findByIdempotencyKey(String idempotencyKey);

    /** Row lock: two simultaneous status changes (e.g. double "cancel") are serialised. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select n from Nalog n where n.id = :id")
    Optional<Nalog> findByIdForUpdate(@Param("id") Long id);
}
