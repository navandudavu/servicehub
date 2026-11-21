import { useCallback, useEffect, useState } from 'react';
import { nalogApi } from '../api/nalog';
import { NalogApiError } from '../api/nalogApi';
import Spinner from '../components/Spinner';
import { useLang } from '../i18n/typedLang';
import { formatMoney } from '../print/formatMoney';
import type { BalanceRow, CountsReport, ReportRow, ReportSummary, ReportTotals, TechnicianView } from '../types/nalog';

const p2 = (n: number) => String(n).padStart(2, '0');
const dateInput = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
/** 'YYYY-MM-DD' -> local midnight as an ISO instant */
const startOf = (v: string) => new Date(`${v}T00:00:00`).toISOString();
/** the END date is inclusive for the user, exclusive for the server -> midnight of the next day */
const endOf = (v: string) => { const d = new Date(`${v}T00:00:00`); d.setDate(d.getDate() + 1); return d.toISOString(); };

function monthStart(offset = 0) { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() + offset, 1); }

function Table({ title, rows, label }: { title: string; rows: ReportRow[]; label: (k: string) => string }) {
  const { t } = useLang();
  if (rows.length === 0) return null;
  return (
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--stone)', letterSpacing: '0.04em', marginBottom: 10 }}>{title}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'right', color: 'var(--stone)', fontSize: 12 }}>
              <th style={{ textAlign: 'left', padding: '4px 0' }} />
              <th>{t('reports_completed')}</th><th>{t('reports_total')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderTop: '1px solid var(--border)', textAlign: 'right' }}>
                <td style={{ textAlign: 'left', padding: '6px 0' }}>{label(r.key)}</td>
                <td>{r.totals.count}</td>
                <td style={{ fontWeight: 600 }}>{formatMoney(r.totals.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 20, fontWeight: 600, fontFamily: 'var(--mono)' }}>{value}</div>
      <div style={{ fontSize: 12.5, color: 'var(--stone)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function Reports() {
  const { t } = useLang();
  const [from, setFrom] = useState(() => dateInput(monthStart()));
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [data, setData] = useState<ReportSummary | null>(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [counts, setCounts] = useState<CountsReport | null>(null);
  const [balance, setBalance] = useState<BalanceRow[] | null>(null);
  const [technicians, setTechnicians] = useState<TechnicianView[]>([]);
  const [balTech, setBalTech] = useState('');
  const [balPart, setBalPart] = useState('');

  useEffect(() => {
    nalogApi.listTechnicians().then(setTechnicians).catch(() => { /* the filter just stays on "all" */ });
  }, []);

  // Nalozi per worker and status, and the material balance, for the same date range. Counts and sums come from the server.
  useEffect(() => {
    if (!from || !to || from > to) return;
    const ctrl = new AbortController();
    setCounts(null); setBalance(null);
    nalogApi.getCountsReport(startOf(from), endOf(to), ctrl.signal).then(setCounts).catch(() => {});
    nalogApi.getStockBalance({ from: startOf(from), to: endOf(to), ...(balTech ? { technicianId: Number(balTech) } : {}) }, ctrl.signal)
      .then(setBalance).catch(() => {});
    return () => ctrl.abort();
  }, [from, to, balTech]);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!from || !to || from > to) return;
    try {
      setData(await nalogApi.getReportSummary(startOf(from), endOf(to), signal));
      setError('');
    } catch (e) {
      if (e instanceof NalogApiError && e.message !== 'Request cancelled') setError(e.message);
    }
  }, [from, to]);

  useEffect(() => {
    const ctrl = new AbortController();
    setData(null);
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  async function exportCsv() {
    if (exporting) return;
    setExporting(true); setError('');
    try {
      const blob = await nalogApi.fetchReportCsv(startOf(from), endOf(to));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `nalozi_${from}_${to}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof NalogApiError ? e.message : t('nalogForm_unexpected'));
    } finally {
      setExporting(false);
    }
  }

  const preset = (a: Date, b: Date) => { setFrom(dateInput(a)); setTo(dateInput(b)); };
  const totals: ReportTotals | undefined = data?.totals;
  const payLabel = (k: string) => t(`payment_${k}`);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 16px' }}>{t('reports_title')}</h1>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ fontSize: 12.5 }}>{t('reports_from')}<br />
          <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ fontSize: 12.5 }}>{t('reports_to')}<br />
          <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="btn-secondary btn-sm" onClick={() => preset(monthStart(), new Date())}>{t('reports_thisMonth')}</button>
        <button className="btn-secondary btn-sm" onClick={() => preset(monthStart(-1), new Date(new Date().getFullYear(), new Date().getMonth(), 0))}>{t('reports_lastMonth')}</button>
        <button className="btn-secondary btn-sm" onClick={() => preset(new Date(new Date().getFullYear(), 0, 1), new Date())}>{t('reports_thisYear')}</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" disabled={exporting || !from || !to || from > to} onClick={exportCsv}>
          {exporting ? t('reports_exporting') : t('reports_exportCsv')}
        </button>
      </div>

      <style>{`@media print { aside, .no-print { display: none !important; } main { padding: 0 !important; } }`}</style>
      <div style={{ fontSize: 12.5, color: 'var(--stone)', marginBottom: 16 }}>{t('reports_note')}</div>

      {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {!data && !error && <Spinner label={t('jobBoard_loading')} />}

      {data && totals && (
        totals.count === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--stone)' }}>{t('reports_none')}</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
              <Stat label={t('reports_completed')} value={String(totals.count)} />
              <Stat label={t('reports_total')} value={`${formatMoney(totals.total)} RSD`} />
            </div>
            <Table title={t('reports_byTechnician')} rows={data.byTechnician} label={(k) => (k === '-' ? t('nalogForm_unassigned') : k)} />
            <Table title={t('reports_byMonth')} rows={data.byMonth} label={(k) => k} />
            <Table title={t('reports_byPayment')} rows={data.byPayment} label={payLabel} />
          </>
        )
      )}

      {/* ---- nalozi per worker, by status ---- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 8px' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>{t('reports_countsTitle')}</h2>
        <button className="btn-secondary btn-sm no-print" onClick={() => window.print()}>{t('stockDoc_print')}</button>
      </div>
      {counts && counts.rows.length > 0 ? <CountsTable report={counts} /> : (
        <div style={{ fontSize: 13, color: 'var(--stone)' }}>{counts ? t('reports_none') : <Spinner label={t('jobBoard_loading')} />}</div>
      )}

      {/* ---- material balance from the zaduzenja / razduzenja ---- */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, margin: '24px 0 8px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>{t('reports_balanceTitle')}</h2>
        <select className="input no-print" style={{ width: 'auto' }} value={balTech} onChange={(e) => setBalTech(e.target.value)}>
          <option value="">{t('stockDoc_allTechnicians')}</option>
          {technicians.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <input className="input no-print" style={{ width: 220 }} value={balPart} placeholder={t('reports_balancePart')} onChange={(e) => setBalPart(e.target.value)} />
        <button className="btn-secondary btn-sm no-print" onClick={() => window.print()}>{t('stockDoc_print')}</button>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--stone)', marginBottom: 8 }}>{t('reports_balanceNote')}</div>
      {balance ? <BalanceTable rows={balance} filter={balPart} /> : <Spinner label={t('jobBoard_loading')} />}
    </div>
  );
}

const ALL_STATUSES = ['DRAFT', 'DISPATCHED', 'IN_PROGRESS', 'AWAITING_PARTS', 'RECEIVED', 'TESTING', 'DRIVING', 'NEEDS_ELECTRICIAN', 'COMPLETED', 'CANCELLED'];

function CountsTable({ report }: { report: CountsReport }) {
  const { t } = useLang();
  // columns: only statuses that occur anywhere, in a fixed order
  const statuses = ALL_STATUSES;
  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead>
          <tr style={{ textAlign: 'right', color: 'var(--stone)', fontSize: 12 }}>
            <th style={{ textAlign: 'left', padding: '10px 14px' }}>{t('stockDoc_technician')}</th>
            {statuses.map((s) => <th key={s} style={{ padding: '0 8px' }}>{t(`nalogStatus_${s}`)}</th>)}
            <th style={{ padding: '0 14px' }}>{t('reports_countsTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.technician} style={{ borderTop: '1px solid var(--border)', textAlign: 'right' }}>
              <td style={{ textAlign: 'left', padding: '8px 14px' }}>{r.technician === '-' ? t('nalogForm_unassigned') : r.technician}</td>
              {statuses.map((s) => <td key={s} style={{ padding: '0 8px', fontFamily: 'var(--mono)' }}>{r.byStatus[s] ?? 0}</td>)}
              <td style={{ padding: '0 14px', fontWeight: 600, fontFamily: 'var(--mono)' }}>{r.total}</td>
            </tr>
          ))}
          <tr style={{ borderTop: '2px solid var(--border)', textAlign: 'right', fontWeight: 600 }}>
            <td style={{ textAlign: 'left', padding: '8px 14px' }}>{t('reports_countsTotal')}</td>
            {statuses.map((s) => <td key={s} style={{ padding: '0 8px', fontFamily: 'var(--mono)' }}>{report.totals.byStatus[s] ?? 0}</td>)}
            <td style={{ padding: '0 14px', fontFamily: 'var(--mono)' }}>{report.totals.total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BalanceTable({ rows, filter }: { rows: BalanceRow[]; filter: string }) {
  const { t } = useLang();
  const f = filter.trim().toLowerCase();
  const shown = f ? rows.filter((r) => r.name.toLowerCase().includes(f) || (r.sku ?? '').toLowerCase().includes(f)) : rows;
  if (shown.length === 0) return <div style={{ fontSize: 13, color: 'var(--stone)' }}>{t('reports_none')}</div>;
  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead>
          <tr style={{ textAlign: 'right', color: 'var(--stone)', fontSize: 12 }}>
            <th style={{ textAlign: 'left', padding: '10px 14px' }}>{t('stockDoc_technician')}</th>
            <th style={{ textAlign: 'left' }}>{t('stockDoc_sku')}</th>
            <th style={{ textAlign: 'left' }}>{t('stockDoc_partName')}</th>
            <th style={{ textAlign: 'left' }}>{t('stockDoc_unit')}</th>
            <th>{t('reports_balanceOpening')}</th><th>{t('reports_balanceIssued')}</th><th>{t('reports_balanceReturned')}</th>
            <th style={{ padding: '0 14px' }}>{t('reports_balanceClosing')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={`${r.technicianId}-${r.partId ?? r.name}-${i}`} style={{ borderTop: '1px solid var(--border)', textAlign: 'right', fontFamily: 'var(--mono)' }}>
              <td style={{ textAlign: 'left', padding: '8px 14px', fontFamily: 'inherit' }}>{r.technicianName}</td>
              <td style={{ textAlign: 'left' }}>{r.sku ?? ''}</td>
              <td style={{ textAlign: 'left' }}>{r.name}</td>
              <td style={{ textAlign: 'left' }}>{r.unit}</td>
              <td>{r.opening}</td><td>{r.issued}</td><td>{r.returned}</td>
              <td style={{ padding: '0 14px', fontWeight: 700 }}>{r.closing}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
