package rs.elgor.nalog.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import rs.elgor.nalog.domain.AppUser;

import java.util.List;
import java.util.Optional;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {
    List<AppUser> findByRoleAndActiveTrueOrderByNameAsc(String role);

    List<AppUser> findAllByOrderByNameAsc();

    Optional<AppUser> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCaseAndIdNot(String email, Long id);

    long countByRoleAndActiveTrue(String role);

    /** False only on a brand-new install (or one where nobody can log in yet). */
    boolean existsByPasswordHashIsNotNull();
}
