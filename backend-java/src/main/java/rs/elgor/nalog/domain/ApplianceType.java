package rs.elgor.nalog.domain;

import java.util.Arrays;
import java.util.List;

/** Names MUST match chk_nalog_appliance. */
public enum ApplianceType {
    AIR_CONDITIONER("Klima uređaj"),
    REFRIGERATOR("Frižider"),
    FREEZER("Zamrzivač"),
    WASHING_MACHINE("Veš mašina"),
    DRYER("Mašina za sušenje"),
    DISHWASHER("Mašina za sudove"),
    OVEN("Rerna"),
    STOVE("Šporet"),
    WATER_HEATER("Grejač vode"),
    BOILER("Bojler"),
    OTHER("Ostalo");

    private final String label;

    ApplianceType(String label) {
        this.label = label;
    }

    /** The Serbian name the apps show for this code. */
    public String label() {
        return label;
    }

    /** Codes whose code or Serbian label contains the (already lower-cased) search text, for the device search. */
    public static List<String> codesMatching(String lowerText) {
        return Arrays.stream(values())
                .filter(t -> t.name().toLowerCase().contains(lowerText) || t.label.toLowerCase().contains(lowerText))
                .map(Enum::name)
                .toList();
    }
}
