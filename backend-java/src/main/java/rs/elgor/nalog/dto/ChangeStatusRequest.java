package rs.elgor.nalog.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import rs.elgor.nalog.domain.NalogStatus;

/** reason is required when the target status is CANCELLED and ignored otherwise. */
public record ChangeStatusRequest(@NotNull NalogStatus status, @Size(max = 1000) String reason) {}
