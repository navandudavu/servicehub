package rs.elgor.nalog.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import rs.elgor.nalog.domain.AuthUser;
import rs.elgor.nalog.domain.Nalog;
import rs.elgor.nalog.domain.NalogPhoto;
import rs.elgor.nalog.domain.NalogStatus;
import rs.elgor.nalog.dto.PhotoView;
import rs.elgor.nalog.repo.NalogPhotoRepository;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Photos on a nalog. Rules:
 *  - same access rule as the nalog itself (technician: only own nalozi; others get 404)
 *  - the file type is decided by the BYTES (magic numbers), never by the client's name or Content-Type
 *  - the stored name is a server-generated UUID, so a client can't choose a path or overwrite a file
 *  - DB row and file stay consistent: a rolled-back upload deletes its file, a deleted row deletes its file
 *    only AFTER the transaction commits
 */
@Service
public class NalogPhotoService {

    private static final Logger log = LoggerFactory.getLogger(NalogPhotoService.class);
    private static final Set<String> CATEGORIES = Set.of("before", "after", "label", "other");
    private static final int MAX_PER_NALOG = 40;

    private final NalogService nalogService;
    private final NalogPhotoRepository photos;
    private final Path dir;
    private final long maxBytes;

    public NalogPhotoService(NalogService nalogService,
                             NalogPhotoRepository photos,
                             @Value("${nalog.photos.dir}") String dir,
                             @Value("${nalog.photos.max-bytes:10485760}") long maxBytes) throws IOException {
        this.nalogService = nalogService;
        this.photos = photos;
        this.dir = Path.of(dir).toAbsolutePath().normalize();
        this.maxBytes = maxBytes;
        Files.createDirectories(this.dir);
    }

    public record FileData(byte[] bytes, String contentType) {}

    @Transactional(rollbackFor = Exception.class)
    public PhotoView upload(Long nalogId, MultipartFile file, String category, String caption, AuthUser actor) {
        Nalog nalog = nalogService.loadAccessible(nalogId, actor);
        if (nalog.getStatus() == NalogStatus.CANCELLED) {
            throw NalogException.conflict("Photos cannot be added to a cancelled nalog");
        }
        if (file == null || file.isEmpty()) {
            throw NalogException.invalid("No photo received");
        }
        if (file.getSize() > maxBytes) {
            throw NalogException.invalid("Photo is too large (max " + (maxBytes / 1024 / 1024) + " MB)");
        }
        if (photos.countByNalogId(nalogId) >= MAX_PER_NALOG) {
            throw NalogException.conflict("A nalog can have at most " + MAX_PER_NALOG + " photos");
        }
        String cat = category == null || category.isBlank() ? "other" : category.toLowerCase();
        if (!CATEGORIES.contains(cat)) {
            throw NalogException.invalid("category must be one of before, after, label, other");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw NalogException.invalid("Could not read the uploaded photo");
        }
        String[] type = sniff(bytes);               // {contentType, extension}
        if (type == null) {
            throw NalogException.invalid("Only JPEG, PNG or WebP images are accepted");
        }

        String filename = UUID.randomUUID() + "." + type[1];
        Path target = dir.resolve(filename).normalize();
        if (!target.startsWith(dir)) {              // cannot happen with a UUID name; belt and braces
            throw NalogException.invalid("Invalid file name");
        }
        try {
            Files.write(target, bytes, StandardOpenOption.CREATE_NEW);
        } catch (IOException e) {
            log.error("Could not store photo for nalog {}", nalogId, e);
            throw new IllegalStateException("Could not store the photo");
        }
        // if anything later rolls the transaction back, do not leave an orphan file behind
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) deleteQuietly(target);
            }
        });

        NalogPhoto p = new NalogPhoto();
        p.setNalogId(nalogId);
        p.setFilename(filename);
        p.setOriginalName(clip(file.getOriginalFilename(), 255));
        p.setCaption(clip(caption, 255));
        p.setCategory(cat);
        p.setContentType(type[0]);
        p.setSizeBytes(bytes.length);
        p.setUploadedById(actor.id());
        p.setUploadedByName(actor.name());
        return PhotoView.from(photos.save(p));
    }

    @Transactional(readOnly = true)
    public List<PhotoView> list(Long nalogId, AuthUser actor) {
        nalogService.loadAccessible(nalogId, actor);
        return photos.findByNalogIdOrderByIdAsc(nalogId).stream().map(PhotoView::from).toList();
    }

    @Transactional(readOnly = true)
    public FileData read(Long nalogId, Long photoId, AuthUser actor) {
        nalogService.loadAccessible(nalogId, actor);
        NalogPhoto p = photos.findByIdAndNalogId(photoId, nalogId)
                .orElseThrow(() -> NalogException.notFound("Photo " + photoId + " not found"));
        try {
            return new FileData(Files.readAllBytes(dir.resolve(p.getFilename()).normalize()), p.getContentType());
        } catch (IOException e) {
            log.error("Photo file missing for photo {}: {}", photoId, p.getFilename());
            throw NalogException.notFound("Photo file is missing on the server");
        }
    }

    /** Admin may delete any photo; a technician only their own uploads. */
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long nalogId, Long photoId, AuthUser actor) {
        nalogService.loadAccessible(nalogId, actor);
        NalogPhoto p = photos.findByIdAndNalogId(photoId, nalogId)
                .orElseThrow(() -> NalogException.notFound("Photo " + photoId + " not found"));
        if (!actor.isAdmin() && !java.util.Objects.equals(p.getUploadedById(), actor.id())) {
            throw NalogException.forbidden("You can only delete your own photos");
        }
        photos.delete(p);
        Path target = dir.resolve(p.getFilename()).normalize();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                deleteQuietly(target);
            }
        });
    }

    // ---- helpers -----------------------------------------------------------

    /** {contentType, extension} from the file's first bytes, or null if it is not an accepted image. */
    static String[] sniff(byte[] b) {
        if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
            return new String[]{"image/jpeg", "jpg"};
        }
        if (b.length >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G'
                && b[4] == 0x0D && b[5] == 0x0A && b[6] == 0x1A && b[7] == 0x0A) {
            return new String[]{"image/png", "png"};
        }
        if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') {
            return new String[]{"image/webp", "webp"};
        }
        return null;
    }

    private static String clip(String s, int max) {
        if (s == null) return null;
        String t = s.strip();
        if (t.isEmpty()) return null;
        return t.length() > max ? t.substring(0, max) : t;
    }

    private static void deleteQuietly(Path p) {
        try {
            Files.deleteIfExists(p);
        } catch (IOException e) {
            log.warn("Could not delete photo file {}: {}", p.getFileName(), e.getMessage());
        }
    }
}
