package rs.elgor.nalog.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import rs.elgor.nalog.domain.NalogNote;

import java.util.List;
import java.util.Optional;

public interface NalogNoteRepository extends JpaRepository<NalogNote, Long> {
    List<NalogNote> findByNalogIdOrderByCreatedAtAscIdAsc(Long nalogId);
    Optional<NalogNote> findByIdAndNalogId(Long id, Long nalogId);
    long countByNalogId(Long nalogId);
}
