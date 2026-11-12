package rs.elgor.nalog.service;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PricingCalculatorTest {

    private final PricingCalculator calc = new PricingCalculator();

    @Test
    void theTypedPriceIsTheTotalAndNothingIsAdded() {
        var t = calc.flat(new BigDecimal("7462.92"));
        assertEquals(new BigDecimal("7462.92"), t.total());
        assertEquals(new BigDecimal("7462.92"), t.subtotal());
        assertEquals(new BigDecimal("0.00"), t.vatAmount());
        assertEquals(new BigDecimal("0.00"), t.laborTotal());
        assertEquals(new BigDecimal("0.00"), t.partsTotal());
    }

    @Test
    void roundsHalfUp() {
        assertEquals(new BigDecimal("0.03"), calc.flat(new BigDecimal("0.025")).total());   // HALF_EVEN would give 0.02
        assertEquals(new BigDecimal("0.03"), calc.lineTotal(new BigDecimal("0.025"), 1));
    }

    @Test
    void noPriceIsZero() {
        assertEquals(new BigDecimal("0.00"), calc.flat(null).total());
    }
}
