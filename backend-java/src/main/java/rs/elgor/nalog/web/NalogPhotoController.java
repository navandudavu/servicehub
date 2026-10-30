package rs.elgor.nalog.web;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import rs.elgor.nalog.dto.PhotoView;
import rs.elgor.nalog.service.NalogPhotoService;
import rs.elgor.nalog.service.UserDirectoryService;

import java.net.URI;
import java.time.Duration;
import java.util.List;

@RestController
@RequestMapping("/api/nalozi/{nalogId}/photos")
public class NalogPhotoController {

    private final NalogPhotoService photos;
    private final UserDirectoryService directory;

    public NalogPhotoController(NalogPhotoService photos, UserDirectoryService directory) {
        this.photos = photos;
        this.directory = directory;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<PhotoView> upload(@PathVariable Long nalogId,
                                            @RequestPart("photo") MultipartFile photo,
                                            @RequestParam(value = "category", required = false) String category,
                                            @RequestParam(value = "caption", required = false) String caption,
                                            @AuthenticationPrincipal Jwt jwt) {
        PhotoView v = photos.upload(nalogId, photo, category, caption, directory.resolve(jwt));
        return ResponseEntity.created(URI.create("/api/nalozi/" + nalogId + "/photos/" + v.id() + "/file")).body(v);
    }

    @GetMapping
    public List<PhotoView> list(@PathVariable Long nalogId, @AuthenticationPrincipal Jwt jwt) {
        return photos.list(nalogId, directory.resolve(jwt));
    }

    /** Image bytes. Needs the Bearer token like everything else, so the client fetches it as a blob. */
    @GetMapping("/{photoId}/file")
    public ResponseEntity<byte[]> file(@PathVariable Long nalogId, @PathVariable Long photoId,
                                       @AuthenticationPrincipal Jwt jwt) {
        NalogPhotoService.FileData f = photos.read(nalogId, photoId, directory.resolve(jwt));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(f.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate())
                .body(f.bytes());
    }

    @DeleteMapping("/{photoId}")
    public ResponseEntity<Void> delete(@PathVariable Long nalogId, @PathVariable Long photoId,
                                       @AuthenticationPrincipal Jwt jwt) {
        photos.delete(nalogId, photoId, directory.resolve(jwt));
        return ResponseEntity.noContent().build();
    }
}
