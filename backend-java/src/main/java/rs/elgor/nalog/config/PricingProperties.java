package rs.elgor.nalog.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;

/**
 * Server-owned pricing inputs. The client NEVER sends a rate or a price:
 * a tampered request can't change what the customer is charged.
 */
@ConfigurationProperties(prefix = "nalog.pricing")
public record PricingProperties(BigDecimal vatRate, BigDecimal laborRatePerHour) {
}
