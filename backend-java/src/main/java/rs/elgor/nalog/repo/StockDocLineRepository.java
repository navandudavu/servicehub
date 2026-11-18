package rs.elgor.nalog.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import rs.elgor.nalog.domain.StockDocLine;

import java.time.Instant;
import java.util.List;

public interface StockDocLineRepository extends JpaRepository<StockDocLine, Long> {

    /** Everything issued or returned before {@code to} (technicianId 0 = everybody). The balance is summed in Java with BigDecimal. */
    @Query("select l from StockDocLine l join fetch l.doc d where (:technicianId = 0L or d.technicianId = :technicianId) and d.docAt < :to")
    List<StockDocLine> linesBefore(@Param("technicianId") long technicianId, @Param("to") Instant to);
}
