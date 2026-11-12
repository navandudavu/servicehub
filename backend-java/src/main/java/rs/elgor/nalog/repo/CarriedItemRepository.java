package rs.elgor.nalog.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import rs.elgor.nalog.domain.CarriedItem;

import java.util.List;

public interface CarriedItemRepository extends JpaRepository<CarriedItem, Long> {
    List<CarriedItem> findByTechnicianIdOrderByNameAscIdAsc(Long technicianId);
    long countByTechnicianId(Long technicianId);
}
