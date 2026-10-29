import type { ApplianceType, NalogResponse, NalogStatus, PaymentType } from '../types/nalog';
import { formatMoney, formatRate } from '../print/formatMoney';
import type { CompanyInfo } from '../print/company';

/**
 * Printable A4 radni nalog. DISPLAY ONLY: every amount is a string from the backend,
 * printed as received (formatMoney only regroups digits).
 *
 * NOT a fiscal receipt / legal faktura. It is the service document the customer
 * signs. Issuing a legal invoice (PIB checks, e-faktura / fiscalisation) is a
 * separate piece of work that needs the accountant's rules.
 */

const APPLIANCE_SR: Record<ApplianceType, string> = {
  AIR_CONDITIONER: 'Klima uređaj', REFRIGERATOR: 'Frižider', FREEZER: 'Zamrzivač',
  WASHING_MACHINE: 'Veš mašina', DRYER: 'Mašina za sušenje', DISHWASHER: 'Mašina za sudove',
  OVEN: 'Rerna', STOVE: 'Šporet', WATER_HEATER: 'Grejač vode', BOILER: 'Bojler', OTHER: 'Ostalo',
};
const PAYMENT_SR: Record<PaymentType, string> = { CASH: 'Gotovina', CARD: 'Kartica', INVOICE: 'Virman / faktura' };
const STATUS_SR: Record<NalogStatus, string> = {
  DRAFT: 'Nacrt', DISPATCHED: 'Dodeljen', IN_PROGRESS: 'U toku',
  AWAITING_PARTS: 'Čeka delove', COMPLETED: 'Završen', CANCELLED: 'Otkazan',
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('sr-Latn-RS', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Belgrade' });

export const PRINT_CSS = `
  @page { size: A4; margin: 14mm; }
  .nalog-print { font: 12px/1.45 Arial, Helvetica, sans-serif; color: #000; max-width: 182mm; margin: 0 auto; }
  .nalog-print h1 { font-size: 20px; margin: 0; }
  .nalog-print .bar { border-bottom: 4px solid #FFF100; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
  .nalog-print .muted { color: #5C6B75; }
  .nalog-print .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
  .nalog-print .box { border: 1px solid #000; padding: 8px 10px; }
  .nalog-print .box h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 4px; }
  .nalog-print table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .nalog-print th { background: #000; color: #FFF100; text-align: left; padding: 5px 8px; font-size: 11px; }
  .nalog-print td { border-bottom: 1px solid #ccc; padding: 5px 8px; }
  .nalog-print .num { text-align: right; white-space: nowrap; }
  .nalog-print .totals { margin-left: auto; width: 62mm; }
  .nalog-print .totals td { border: 0; padding: 2px 8px; }
  .nalog-print .totals .grand td { border-top: 2px solid #000; font-weight: bold; font-size: 14px; background: #FFF100; }
  .nalog-print .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 30mm; margin-top: 22mm; text-align: center; }
  .nalog-print .sign div { border-top: 1px solid #000; padding-top: 4px; }
  .nalog-print footer { margin-top: 12mm; font-size: 10px; color: #5C6B75; }
  @media print { .no-print { display: none !important; } }
`;

export function NalogPrint({ nalog, company }: { nalog: NalogResponse; company: CompanyInfo }) {
  const c = nalog.customer;
  const a = nalog.appliance;
  return (
    <div className="nalog-print">
      <style>{PRINT_CSS}</style>

      <div className="bar">
        <div>
          <h1>{company.name}</h1>
          <div className="muted">{company.address} · {company.phone} · {company.email}</div>
          <div className="muted">PIB {company.pib} · MB {company.mb} · Tekući račun {company.bankAccount}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 'bold' }}>RADNI NALOG</div>
          <div>Br. {nalog.nalogNumber}</div>
          <div className="muted">Datum: {fmtDate(nalog.createdAt)} · Status: {STATUS_SR[nalog.status]}</div>
        </div>
      </div>

      <div className="grid">
        <div className="box">
          <h2>Korisnik</h2>
          <strong>{c.fullName}</strong><br />
          {c.address}{c.city ? `, ${c.city}` : ''}<br />
          Tel: {c.phone}{c.email ? ` · ${c.email}` : ''}
          {c.locationNotes && <><br /><span className="muted">{c.locationNotes}</span></>}
        </div>
        <div className="box">
          <h2>Uređaj</h2>
          <strong>{APPLIANCE_SR[a.type]}</strong> — {a.brand}{a.model ? ` ${a.model}` : ''}<br />
          Serijski broj: {a.serialNumber ?? '—'}<br />
          Serviser: {nalog.assignedToName ?? '—'}
        </div>
      </div>

      <div className="box" style={{ marginBottom: 14 }}>
        <h2>Opis kvara / dijagnoza</h2>
        <div style={{ whiteSpace: 'pre-wrap' }}>{nalog.diagnosis}</div>
      </div>

      <table>
        <thead>
          <tr><th>Opis</th><th className="num">Kol.</th><th className="num">Cena</th><th className="num">Iznos (RSD)</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Rad (servis)</td>
            <td className="num">{nalog.laborHours} h</td>
            <td className="num">{formatMoney(nalog.laborRate)}</td>
            <td className="num">{formatMoney(nalog.laborTotal)}</td>
          </tr>
          {nalog.partLines.map((l) => (
            <tr key={l.partId}>
              <td>{l.name} <span className="muted">({l.sku})</span></td>
              <td className="num">{l.quantity}</td>
              <td className="num">{formatMoney(l.unitPrice)}</td>
              <td className="num">{formatMoney(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="totals">
        <tbody>
          <tr><td>Osnovica</td><td className="num">{formatMoney(nalog.subtotal)}</td></tr>
          <tr><td>PDV {formatRate(nalog.vatRate)}</td><td className="num">{formatMoney(nalog.vatAmount)}</td></tr>
          <tr className="grand"><td>UKUPNO</td><td className="num">{formatMoney(nalog.total)} RSD</td></tr>
        </tbody>
      </table>
      <div>Način plaćanja: <strong>{PAYMENT_SR[nalog.paymentType]}</strong></div>

      <div className="sign">
        <div>Serviser</div>
        <div>Korisnik (potpis)</div>
      </div>

      <footer>Ovaj dokument je radni nalog i nije fiskalni račun.</footer>
    </div>
  );
}
