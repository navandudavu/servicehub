package rs.elgor.nalog.dto;

import jakarta.validation.constraints.Size;

/** {"workDone": "Zamenjen kompresor"} sets "Izvrseni radovi", blank or null clears it. */
public record WorkDoneRequest(@Size(max = 4000) String workDone) {}
