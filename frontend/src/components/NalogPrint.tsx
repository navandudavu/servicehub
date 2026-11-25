import type { MaterialLine, NalogResponse, NalogStatus, NoteView, PaymentType } from '../types/nalog';
import { formatMoney } from '../print/formatMoney';

// A device type an admin added is printed by its own name.
const applianceName = (type: string) => APPLIANCE_SR[type] ?? type;
import type { CompanyInfo } from '../print/company';

/**
 * Printable A4 radni nalog. DISPLAY ONLY: every amount is a string from the backend,
 * printed as received (formatMoney only regroups digits).
 *
 * NOT a fiscal receipt / legal faktura. It is the service document the customer
 * signs. Issuing a legal invoice (PIB checks, e-faktura / fiscalisation) is a
 * separate piece of work that needs the accountant's rules.
 */

const APPLIANCE_SR: Record<string, string> = {
  AIR_CONDITIONER: 'Klima uređaj', REFRIGERATOR: 'Frižider', FREEZER: 'Zamrzivač',
  WASHING_MACHINE: 'Veš mašina', DRYER: 'Mašina za sušenje', DISHWASHER: 'Mašina za sudove',
  OVEN: 'Rerna', STOVE: 'Šporet', WATER_HEATER: 'Grejač vode', BOILER: 'Bojler', OTHER: 'Ostalo',
};
const PAYMENT_SR: Record<PaymentType, string> = { CASH: 'Gotovina', CARD: 'Kartica', INVOICE: 'Virman / faktura' };
const STATUS_SR: Record<NalogStatus, string> = {
  DRAFT: 'Nacrt', DISPATCHED: 'Dodeljen', IN_PROGRESS: 'U toku',
  AWAITING_PARTS: 'Čeka delove', RECEIVED: 'Preuzet u servis', TESTING: 'Testira se', DRIVING: 'Vozi se',
  NEEDS_ELECTRICIAN: 'Potreban elektroničar', COMPLETED: 'Završen', CANCELLED: 'Otkazan',
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('sr-Latn-RS', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Belgrade' });

export const PRINT_CSS = `
  @page { size: A4; margin: 14mm; }
  .nalog-print { font: 12px/1.45 Arial, Helvetica, sans-serif; color: #000; max-width: 182mm; margin: 0 auto; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .nalog-print h1 { font-size: 20px; margin: 0; }
  .nalog-print .bar { border-bottom: 2px solid #000; box-shadow: 0 4px 0 #FFF100; padding-bottom: 8px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
  .nalog-print .muted { color: #5C6B75; }
  .nalog-print .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
  .nalog-print .box { border: 1px solid #000; padding: 8px 10px; }
  .nalog-print .box h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 4px; }
  .nalog-print table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .nalog-print th { color: #000; text-align: left; padding: 5px 8px; font-size: 11px; border-top: 2px solid #000; border-bottom: 2px solid #000; }
  .nalog-print td { border-bottom: 1px solid #ccc; padding: 5px 8px; }
  .nalog-print .num { text-align: right; white-space: nowrap; }
  .nalog-print .totals { margin-left: auto; width: 62mm; }
  .nalog-print .totals td { border: 0; padding: 2px 8px; }
  .nalog-print .totals .grand td { border-top: 2px solid #000; border-bottom: 2px solid #000; font-weight: bold; font-size: 14px; background: #FFF100; }
  .nalog-print thead { display: table-header-group; }
  .nalog-print tr, .nalog-print .box, .nalog-print .sign, .nalog-print .totals { break-inside: avoid; page-break-inside: avoid; }
  .nalog-print .ack { margin-top: 10mm; font-size: 11px; }
  .nalog-print .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 30mm; margin-top: 22mm; text-align: center; }
  .nalog-print .sign div { border-top: 1px solid #000; padding-top: 4px; }
  .nalog-print.sheet-break { break-after: page; page-break-after: always; }
  .nalog-print .copy { text-align: right; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 4px; }
  .nalog-print footer { margin-top: 12mm; font-size: 10px; color: #5C6B75; }
  .nalog-print .stamp { text-align: right; margin-top: 6mm; break-inside: avoid; page-break-inside: avoid; }
  .nalog-print .stamp img { height: 28mm; width: auto; }
  @media print { .no-print { display: none !important; } }
`;

/**
 * A nalog is always printed twice, one page each: the technician's copy and the customer's copy (both signed).
 * The revers (device taken into the workshop) stays a single page.
 */
export function NalogPrint({ nalog, notes, company, revers = false, material = [] }: { nalog: NalogResponse; notes: NoteView[]; company: CompanyInfo; revers?: boolean; material?: MaterialLine[] }) {
  if (revers) {
    return <div><style>{PRINT_CSS}</style><NalogSheet nalog={nalog} notes={notes} material={material} company={company} revers /></div>;
  }
  return (
    <div>
      <style>{PRINT_CSS}</style>
      <NalogSheet nalog={nalog} notes={notes} material={material} company={company} copy="Primerak servisera" pageBreak />
      <NalogSheet nalog={nalog} notes={notes} material={material} company={company} copy="Primerak korisnika" />
    </div>
  );
}

function NalogSheet({ nalog, notes, material, company, revers = false, copy, pageBreak = false }:
  { nalog: NalogResponse; notes: NoteView[]; material: MaterialLine[]; company: CompanyInfo; revers?: boolean; copy?: string; pageBreak?: boolean }) {
  const c = nalog.customer;
  const a = nalog.appliance;
  return (
    <div className={`nalog-print${pageBreak ? ' sheet-break' : ''}`}>
      {copy && <div className="copy">{copy}</div>}

      <div className="bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/elgor-logo.png" alt="" style={{ width: '17mm', height: '17mm' }} />
          <div>
          <h1>{company.name}</h1>
          <div className="muted">{company.address} · {company.phone} · {company.email}</div>
          <div className="muted">PIB {company.pib} · MB {company.mb} · Tekući račun {company.bankAccount}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 'bold' }}>{revers ? 'REVERS' : 'RADNI NALOG'}</div>
          <div>Br. {nalog.nalogNumber}</div>
          <div className="muted">Datum: {fmtDate(nalog.createdAt)}{nalog.completedAt ? ` · Završeno: ${fmtDate(nalog.completedAt)}` : ''}</div>
          {!revers && <div className="muted">Status: {STATUS_SR[nalog.status]}</div>}
        </div>
      </div>

      {revers && (
        <div className="box" style={{ marginBottom: 14, textAlign: 'center', fontSize: 18, fontWeight: 'bold', background: '#FFF100' }}>
          APARAT PREUZET U SERVIS
        </div>
      )}

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
          <strong>{applianceName(a.type)}</strong> — {a.brand}{a.model ? ` ${a.model}` : ''}<br />
          Serijski broj: {a.serialNumber ?? '—'}<br />
          Serviser: {nalog.assignedToName ?? '—'}
        </div>
      </div>

      <div className="box" style={{ marginBottom: 14 }}>
        <h2>Opis kvara / dijagnoza</h2>
        <div style={{ whiteSpace: 'pre-wrap' }}>{nalog.diagnosis}</div>
      </div>

      {revers ? (
        <div style={{ marginBottom: 14 }}>Uređaj je preuzet u servis dana {fmtDate(nalog.createdAt)}.</div>
      ) : (
        <>
      {notes.length > 0 && (
        <div className="box" style={{ marginBottom: 14 }}>
          <h2>Konstatacija / izvršeni radovi</h2>
          {notes.map((n) => <div key={n.id} style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>)}
        </div>
      )}

      {material.length > 0 && (
        <div className="box" style={{ marginBottom: 14 }}>
          <h2>Materijal</h2>
          {material.map((m) => <div key={m.lineId}>{m.name}{m.sku ? ` (${m.sku})` : ''} — {m.quantity} {m.unit}</div>)}
        </div>
      )}

      {nalog.status === 'CANCELLED' && (
        <div className="box" style={{ marginBottom: 14 }}>
          <h2>Razlog otkazivanja</h2>
          <div style={{ whiteSpace: 'pre-wrap' }}>{nalog.cancelReason ?? '—'}</div>
        </div>
      )}

      <table className="totals">
        <tbody>
          <tr className="grand"><td>CENA</td><td className="num">{formatMoney(nalog.total)} RSD</td></tr>
        </tbody>
      </table>
      <div>Način plaćanja: <strong>{PAYMENT_SR[nalog.paymentType]}</strong></div>

      <div className="ack">Potpisom korisnik potvrđuje da su navedeni radovi izvršeni, da je uređaj preuzet i da je upoznat sa iznosom.</div>

      <div className="sign">
        <div>Serviser</div>
        <div>Korisnik (potpis)</div>
      </div>
        </>
      )}

      <div className="stamp"><img src="/elgor-stamp.png" alt="" /></div>

      <footer>
        {company.warranty && <div style={{ marginBottom: 4 }}>{company.warranty}</div>}
        {revers ? 'Ovaj dokument je revers o preuzimanju uređaja u servis.' : 'Ovaj dokument je radni nalog i nije fiskalni račun.'}
      </footer>
    </div>
  );
}
