package rs.elgor.nalog.repo;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import rs.elgor.nalog.domain.StockDoc;

import java.time.Instant;
import java.util.List;

public interface StockDocRepository extends JpaRepository<StockDoc, Long> {

    /** technicianId 0 = everybody; the period is [from, to). Sentinels instead of nulls (Postgres cannot type a null parameter). */
    @Query("select d from StockDoc d where (:anyType = true or d.type = :type) "
            + "and (:technicianId = 0L or d.technicianId = :technicianId) "
            + "and d.docAt >= :from and d.docAt < :to")
    Page<StockDoc> search(@Param("anyType") boolean anyType, @Param("type") StockDoc.Type type,
                          @Param("technicianId") long technicianId,
                          @Param("from") Instant from, @Param("to") Instant to, Pageable pageable);

    List<StockDoc> findByNalogIdOrderByDocAtAscIdAsc(Long nalogId);

    @Query(value = "select nextval('stock_doc_zad_seq')", nativeQuery = true)
    long nextZadNo();

    @Query(value = "select nextval('stock_doc_raz_seq')", nativeQuery = true)
    long nextRazNo();
}
