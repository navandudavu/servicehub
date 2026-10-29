package rs.elgor.nalog.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import rs.elgor.nalog.domain.StockMovement;

import java.util.List;

public interface StockMovementRepository extends JpaRepository<StockMovement, Long> {
    List<StockMovement> findTop50ByPartIdOrderByCreatedAtDescIdDesc(Long partId);
}
