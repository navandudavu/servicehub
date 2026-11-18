package rs.elgor.nalog.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import rs.elgor.nalog.domain.ApplianceTypeCustom;

import java.util.List;

public interface ApplianceTypeCustomRepository extends JpaRepository<ApplianceTypeCustom, Long> {

    List<ApplianceTypeCustom> findAllByOrderByNameAsc();

    boolean existsByNameIgnoreCase(String name);
}
