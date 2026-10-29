package rs.elgor.nalog.dto;

import org.springframework.data.domain.Page;

import java.util.List;

/** Stable paging envelope (we never serialise Spring's Page directly - its JSON shape is not a contract). */
public record PageResponse<T>(List<T> items, int page, int size, long totalItems, int totalPages) {
    public static <T> PageResponse<T> of(Page<T> p) {
        return new PageResponse<>(p.getContent(), p.getNumber(), p.getSize(), p.getTotalElements(), p.getTotalPages());
    }
}
