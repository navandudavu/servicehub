package rs.elgor.nalog.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.domain.Nalog;
import rs.elgor.nalog.domain.NalogNote;
import rs.elgor.nalog.domain.NalogStatus;
import rs.elgor.nalog.dto.NoteDtos.CreateNoteRequest;
import rs.elgor.nalog.dto.NoteDtos.NoteView;
import rs.elgor.nalog.repo.NalogNoteRepository;

import java.util.List;

/**
 * Notes follow the nalog's access rule exactly (NalogService.loadAccessible): admin sees all,
 * a technician only the nalozi assigned to or created by them, everyone else gets 404.
 * Notes can be added on any status except COMPLETED: a finished nalog is a closed record, so its konstatacije are
 * read-only for everyone (adding and deleting both). CANCELLED still accepts them ("client cancelled").
 */
@Service
public class NalogNoteService {

    static final int MAX_PER_NALOG = 200;

    private final NalogNoteRepository notes;
    private final NalogService nalogService;

    public NalogNoteService(NalogNoteRepository notes, NalogService nalogService) {
        this.notes = notes;
        this.nalogService = nalogService;
    }

    private static void requireNotCompleted(Nalog nalog) {
        if (nalog.getStatus() == NalogStatus.COMPLETED) {
            throw NalogException.conflict("Konstatacije se ne mogu menjati na završenom nalogu");
        }
    }

    @Transactional(readOnly = true)
    public List<NoteView> list(Long nalogId, AuthUser actor) {
        nalogService.loadAccessible(nalogId, actor);
        return notes.findByNalogIdOrderByCreatedAtAscIdAsc(nalogId).stream().map(NoteView::from).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public NoteView add(Long nalogId, CreateNoteRequest req, AuthUser actor) {
        requireNotCompleted(nalogService.loadAccessible(nalogId, actor));
        String body = req.body() == null ? "" : req.body().trim();
        if (body.isEmpty()) {
            throw NalogException.invalid("A note cannot be empty");
        }
        if (notes.countByNalogId(nalogId) >= MAX_PER_NALOG) {
            throw NalogException.conflict("A nalog can have at most " + MAX_PER_NALOG + " notes");
        }
        NalogNote n = new NalogNote();
        n.setNalogId(nalogId);
        n.setAuthorId(actor == null ? null : actor.id());
        n.setAuthorName(actor == null ? "unknown" : actor.name());
        n.setBody(body);
        return NoteView.from(notes.saveAndFlush(n));
    }

    /** Admin only. Notes are a record; technicians correct a mistake by adding a newer note. */
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long nalogId, Long noteId, AuthUser actor) {
        if (actor == null || !actor.isAdmin()) {
            throw NalogException.forbidden("Only an admin can delete a note");
        }
        requireNotCompleted(nalogService.loadAccessible(nalogId, actor));
        NalogNote n = notes.findByIdAndNalogId(noteId, nalogId)
                .orElseThrow(() -> NalogException.notFound("Note " + noteId + " not found"));
        notes.delete(n);
    }
}
