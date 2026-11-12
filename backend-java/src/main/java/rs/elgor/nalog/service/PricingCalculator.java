package rs.elgor.nalog.service;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * The price of a nalog is typed in by hand: one amount, no hourly rate, no VAT, no parts sum.
 * This class only fits that amount into the stored columns (subtotal = total = price, everything else 0)
 * and rounds it HALF_UP to 2 decimals. Parts on a nalog are for stock only and never change the price.
 */
@Component
public class PricingCalculator {

    static final int MONEY_SCALE = 2;
    static final RoundingMode ROUNDING = RoundingMode.HALF_UP;

    public record Totals(BigDecimal laborRate,
                         BigDecimal laborTotal,
                         BigDecimal partsTotal,
                         BigDecimal subtotal,
                         BigDecimal vatRate,
                         BigDecimal vatAmount,
                         BigDecimal total) {}

    public BigDecimal lineTotal(BigDecimal unitPrice, int quantity) {
        return unitPrice.multiply(BigDecimal.valueOf(quantity)).setScale(MONEY_SCALE, ROUNDING);
    }

    /** null means "no price typed": 0.00. */
    public Totals flat(BigDecimal price) {
        BigDecimal p = (price == null ? BigDecimal.ZERO : price).setScale(MONEY_SCALE, ROUNDING);
        BigDecimal zero = BigDecimal.ZERO.setScale(MONEY_SCALE, ROUNDING);
        return new Totals(zero, zero, zero, p, BigDecimal.ZERO.setScale(4, ROUNDING), zero, p);
    }
}
