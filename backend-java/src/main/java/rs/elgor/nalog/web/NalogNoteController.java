package rs.elgor.nalog.web;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import rs.elgor.nalog.dto.NoteDtos.CreateNoteRequest;
import rs.elgor.nalog.dto.NoteDtos.NoteView;
import rs.elgor.nalog.service.NalogNoteService;
import rs.elgor.nalog.service.UserDirectoryService;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/nalozi/{nalogId}/notes")
public class NalogNoteController {

    private final NalogNoteService notes;
    private final UserDirectoryService directory;

    public NalogNoteController(NalogNoteService notes, UserDirectoryService directory) {
        this.notes = notes;
        this.directory = directory;
    }

    @GetMapping
    public List<NoteView> list(@PathVariable Long nalogId, @AuthenticationPrincipal Jwt jwt) {
        return notes.list(nalogId, directory.resolve(jwt));
    }

    @PostMapping
    public ResponseEntity<NoteView> add(@PathVariable Long nalogId, @Valid @RequestBody CreateNoteRequest request,
                                        @AuthenticationPrincipal Jwt jwt) {
        NoteView v = notes.add(nalogId, request, directory.resolve(jwt));
        return ResponseEntity.created(URI.create("/api/nalozi/" + nalogId + "/notes/" + v.id())).body(v);
    }

    @DeleteMapping("/{noteId}")
    public ResponseEntity<Void> delete(@PathVariable Long nalogId, @PathVariable Long noteId,
                                       @AuthenticationPrincipal Jwt jwt) {
        notes.delete(nalogId, noteId, directory.resolve(jwt));
        return ResponseEntity.noContent().build();
    }
}
