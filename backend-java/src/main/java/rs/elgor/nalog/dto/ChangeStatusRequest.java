package rs.elgor.nalog.dto;

import jakarta.validation.constraints.NotNull;
import rs.elgor.nalog.domain.NalogStatus;

public record ChangeStatusRequest(@NotNull NalogStatus status) {}
