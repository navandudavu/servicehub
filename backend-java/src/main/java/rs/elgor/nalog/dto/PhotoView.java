package rs.elgor.nalog.dto;

import rs.elgor.nalog.domain.NalogPhoto;

import java.time.Instant;

/** Metadata only. The bytes come from GET /api/nalozi/{id}/photos/{photoId}/file (auth required). */
public record PhotoView(Long id, Long nalogId, String category, String caption, String originalName,
                        String contentType, long sizeBytes, Long uploadedById, String uploadedByName,
                        Instant createdAt) {
    public static PhotoView from(NalogPhoto p) {
        return new PhotoView(p.getId(), p.getNalogId(), p.getCategory(), p.getCaption(), p.getOriginalName(),
                p.getContentType(), p.getSizeBytes(), p.getUploadedById(), p.getUploadedByName(), p.getCreatedAt());
    }
}
