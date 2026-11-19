package rs.elgor.nalog.service;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.elgor.nalog.domain.Part;
import rs.elgor.nalog.dto.PageResponse;
import rs.elgor.nalog.dto.PartDtos.*;
import rs.elgor.nalog.repo.PartRepository;

import java.util.ArrayList;
import java.util.List;

/** Magacin: a catalogue of sifra / naziv / jedinica mere. Parts are hidden (inactive), never deleted. */
@Service
public class PartService {

    private final PartRepository partRepository;

    public PartService(PartRepository partRepository) {
        this.partRepository = partRepository;
    }

    /** Lookup used by the Zaduzenje / Razduzenje search. */
    @Transactional(readOnly = true)
    public PageResponse<PartResponse> search(String q, boolean onlyActive, int page, int size) {
        String cleaned = q == null ? "" : q.trim().toLowerCase().replace("%", "").replace("_", "");
        var result = partRepository.search("%" + cleaned + "%", onlyActive,
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100), Sort.by("name")));
        return PageResponse.of(result.map(PartResponse::from));
    }

    @Transactional(rollbackFor = Exception.class)
    public PartResponse create(CreatePartRequest req) {
        String sku = req.sku().trim();
        if (partRepository.existsBySku(sku)) {
            throw NalogException.conflict("Šifra " + sku + " već postoji");
        }
        Part p = new Part();
        p.setSku(sku);
        p.setName(req.name().trim());
        p.setUnit(cleanUnit(req.unit(), "kom"));
        return PartResponse.from(partRepository.saveAndFlush(p));
    }

    @Transactional(rollbackFor = Exception.class)
    public PartResponse update(Long id, UpdatePartRequest req) {
        Part p = partRepository.findById(id).orElseThrow(() -> NalogException.notFound("Part " + id + " not found"));
        p.setName(req.name().trim());
        p.setActive(req.active());
        if (req.unit() != null) {
            p.setUnit(cleanUnit(req.unit(), p.getUnit()));
        }
        return PartResponse.from(partRepository.saveAndFlush(p));
    }

    private static String cleanUnit(String unit, String fallback) {
        String u = unit == null ? "" : unit.trim();
        return u.isEmpty() ? fallback : u;
    }

    /** Activate / deactivate a selection (hidden from the search, never deleted). All or nothing. */
    @Transactional(rollbackFor = Exception.class)
    public int setActiveMany(List<Long> ids, boolean active) {
        List<Long> sorted = ids.stream().distinct().sorted().toList();
        List<Part> found = partRepository.findAllById(sorted);
        if (found.size() != sorted.size()) {
            throw NalogException.notFound("Neki izabrani delovi više ne postoje. Ništa nije promenjeno.");
        }
        found.forEach(p -> p.setActive(active));
        partRepository.saveAll(found);
        partRepository.flush();
        return found.size();
    }

    /**
     * Import: CSV text with sifra, naziv, jedinica mere (separator ; or , or tab, optional header row).
     * Existing sifra = name and unit are updated (and the part is reactivated); new sifra = created. Bad lines are
     * skipped and reported, the rest is imported - all in ONE transaction.
     */
    @Transactional(rollbackFor = Exception.class)
    public ImportResult importCsv(String csv) {
        int created = 0;
        int updated = 0;
        List<String> skipped = new ArrayList<>();
        int lineNo = 0;
        for (String raw : csv.replace("﻿", "").split("\\R")) {
            lineNo++;
            String line = raw.strip();
            if (line.isEmpty()) {
                continue;
            }
            String sep = line.contains(";") ? ";" : line.contains("\t") ? "\t" : ",";
            String[] c = line.split(sep, -1);
            String sku = c.length > 0 ? unquote(c[0]) : "";
            String name = c.length > 1 ? unquote(c[1]) : "";
            String unit = c.length > 2 ? unquote(c[2]) : "";
            if (lineNo == 1 && sku.toLowerCase().startsWith("šif") || lineNo == 1 && sku.toLowerCase().startsWith("sif")) {
                continue;                                              // header row
            }
            if (sku.isEmpty() || name.isEmpty()) {
                skipped.add("Red " + lineNo + ": nedostaje šifra ili naziv");
                continue;
            }
            if (sku.length() > 60 || name.length() > 200 || unit.length() > 20) {
                skipped.add("Red " + lineNo + ": predugačak podatak");
                continue;
            }
            Part p = partRepository.findBySku(sku).orElse(null);
            if (p == null) {
                p = new Part();
                p.setSku(sku);
                created++;
            } else {
                updated++;
            }
            p.setName(name);
            p.setUnit(cleanUnit(unit, p.getUnit()));
            p.setActive(true);
            partRepository.save(p);
        }
        partRepository.flush();
        return new ImportResult(created, updated, skipped);
    }

    private static String unquote(String s) {
        String t = s.strip();
        if (t.length() >= 2 && t.startsWith("\"") && t.endsWith("\"")) {
            t = t.substring(1, t.length() - 1).strip();
        }
        return t;
    }
}
