package rs.elgor.nalog.domain;

/** Names MUST match chk_nalog_payment. INVOICE = bank transfer / "virman". */
public enum PaymentType {
    CASH,
    CARD,
    INVOICE
}
