package rs.elgor.nalog.service;

import org.springframework.stereotype.Component;
import rs.elgor.nalog.config.PricingProperties;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * RULE A: the ONLY place money is calculated. Pure arithmetic, no I/O, so it is
 * trivially unit-testable.
 *
 * - BigDecimal everywhere, never double.
 * - Every monetary result is rounded explicitly to 2 decimals with HALF_UP
 *   (0.005 -> 0.01), the usual commercial rounding.
 * - Rounding happens PER LINE and then lines are summed, so the printed lines
 *   always add up to the printed subtotal (no 1-para off-by-one on the invoice).
 */
@Component
public class PricingCalculator {

    static final int MONEY_SCALE = 2;
    static final RoundingMode ROUNDING = RoundingMode.HALF_UP;

    private final PricingProperties props;

    public PricingCalculator(PricingProperties props) {
        this.props = props;
    }

    public record Line(BigDecimal unitPrice, int quantity) {}

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

    public Totals calculate(BigDecimal laborHours, List<Line> lines) {
        BigDecimal rate = props.laborRatePerHour().setScale(MONEY_SCALE, ROUNDING);

        BigDecimal laborTotal = laborHours.multiply(rate).setScale(MONEY_SCALE, ROUNDING);

        BigDecimal partsTotal = BigDecimal.ZERO.setScale(MONEY_SCALE, ROUNDING);
        for (Line line : lines) {
            partsTotal = partsTotal.add(lineTotal(line.unitPrice(), line.quantity()));
        }

        BigDecimal subtotal = laborTotal.add(partsTotal);
        BigDecimal vatAmount = subtotal.multiply(props.vatRate()).setScale(MONEY_SCALE, ROUNDING);
        BigDecimal total = subtotal.add(vatAmount);

        return new Totals(rate, laborTotal, partsTotal, subtotal,
                props.vatRate().setScale(4, ROUNDING), vatAmount, total);
    }
}
