package rs.elgor.nalog.service;

import org.junit.jupiter.api.Test;
import rs.elgor.nalog.config.PricingProperties;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PricingCalculatorTest {

    private final PricingCalculator calc = new PricingCalculator(
            new PricingProperties(new BigDecimal("0.2000"), new BigDecimal("2500.00")));

    @Test
    void computesLaborPartsVatAndTotal() {
        var t = calc.calculate(new BigDecimal("1.50"),
                List.of(new PricingCalculator.Line(new BigDecimal("1234.55"), 2)));

        assertEquals(new BigDecimal("3750.00"), t.laborTotal());   // 1.5 * 2500
        assertEquals(new BigDecimal("2469.10"), t.partsTotal());   // 2 * 1234.55
        assertEquals(new BigDecimal("6219.10"), t.subtotal());
        assertEquals(new BigDecimal("1243.82"), t.vatAmount());    // 1243.82 exactly
        assertEquals(new BigDecimal("7462.92"), t.total());
    }

    @Test
    void roundsHalfUp() {
        // 0.333 * 3 = 0.999 -> 1.00 ; VAT 20% of 1.00 = 0.20
        var t = calc.calculate(BigDecimal.ZERO,
                List.of(new PricingCalculator.Line(new BigDecimal("0.333"), 3)));
        assertEquals(new BigDecimal("1.00"), t.partsTotal());

        // 0.025 * 1 = 0.025 -> HALF_UP -> 0.03 (HALF_EVEN would give 0.02)
        assertEquals(new BigDecimal("0.03"),
                calc.lineTotal(new BigDecimal("0.025"), 1));
    }

    @Test
    void noPartsNoLaborIsZero() {
        var t = calc.calculate(BigDecimal.ZERO, List.of());
        assertEquals(new BigDecimal("0.00"), t.total());
    }
}
