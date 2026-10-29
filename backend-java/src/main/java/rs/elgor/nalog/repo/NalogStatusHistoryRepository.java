package rs.elgor.nalog.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import rs.elgor.nalog.domain.NalogStatusHistory;

import java.util.List;

public interface NalogStatusHistoryRepository extends JpaRepository<NalogStatusHistory, Long> {
    List<NalogStatusHistory> findByNalogIdOrderByChangedAtAscIdAsc(Long nalogId);
}
