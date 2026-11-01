package rs.elgor.nalog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import rs.elgor.nalog.domain.NalogNote;

import java.time.Instant;

/** Notes on a nalog. Mirrored in frontend/src/types/nalog.ts. */
public final class NoteDtos {
    private NoteDtos() {}

    public record CreateNoteRequest(@NotBlank @Size(max = 2000) String body) {}

    public record NoteView(Long id, Long nalogId, Long authorId, String authorName, String body, Instant createdAt) {
        public static NoteView from(NalogNote n) {
            return new NoteView(n.getId(), n.getNalogId(), n.getAuthorId(), n.getAuthorName(), n.getBody(), n.getCreatedAt());
        }
    }
}
