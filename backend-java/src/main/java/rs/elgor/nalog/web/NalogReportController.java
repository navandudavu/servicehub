package rs.elgor.nalog.web;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import rs.elgor.nalog.dto.ReportSummary;
import rs.elgor.nalog.service.NalogReportService;

import java.nio.charset.StandardCharsets;
import java.time.Instant;

/** Admin only: money figures never go to technicians. */
@RestController
@RequestMapping("/api/nalozi/reports")
@PreAuthorize("hasRole('ADMIN')")
public class NalogReportController {

    private final NalogReportService reports;

    public NalogReportController(NalogReportService reports) {
        this.reports = reports;
    }

    @GetMapping("/summary")
    public ReportSummary summary(@RequestParam Instant from, @RequestParam Instant to) {
        return reports.summary(from, to);
    }

    @GetMapping("/export.csv")
    public ResponseEntity<byte[]> export(@RequestParam Instant from, @RequestParam Instant to,
                                         @RequestParam(required = false) String status) {
        byte[] body = reports.csv(from, to, status).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"nalozi.csv\"")
                .header("X-Content-Type-Options", "nosniff")
                .body(body);
    }
}
