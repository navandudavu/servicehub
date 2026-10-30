package rs.elgor.nalog.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import rs.elgor.nalog.domain.NalogPhoto;

import java.util.List;
import java.util.Optional;

public interface NalogPhotoRepository extends JpaRepository<NalogPhoto, Long> {
    List<NalogPhoto> findByNalogIdOrderByIdAsc(Long nalogId);
    Optional<NalogPhoto> findByIdAndNalogId(Long id, Long nalogId);
    long countByNalogId(Long nalogId);
}
