import { useEffect, useState } from 'react';
import { nalogApi } from '../api/nalog';
import { NalogApiError } from '../api/nalogApi';
import Spinner from '../components/Spinner';
import { useLang } from '../i18n/typedLang';
import type { CountsReport, TechnicianView } from '../types/nalog';

const p2 = (n: number) => String(n).padStart(2, '0');
const dateInput = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
/** 'YYYY-MM-DD' -> local midnight as an ISO instant */
const startOf = (v: string) => new Date(`${v}T00:00:00`).toISOString();
/** the END date is inclusive for the user, exclusive for the server -> midnight of the next day */
const endOf = (v: string) => { const d = new Date(`${v}T00:00:00`); d.setDate(d.getDate() + 1); return d.toISOString(); };

function monthStart(offset = 0) { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() + offset, 1); }

export default function Reports() {
  const { t } = useLang();
  const [from, setFrom] = useState(() => dateInput(monthStart()));
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [counts, setCounts] = useState<CountsReport | null>(null);
  const [technicians, setTechnicians] = useState<TechnicianView[]>([]);
  const [techFilter, setTechFilter] = useState('');

  useEffect(() => {
    nalogApi.listTechnicians().then(setTechnicians).catch(() => { /* the filter just stays on "all" */ });
  }, []);

  // Nalozi per worker and status for the date range; the counts come from the server.
  useEffect(() => {
    if (!from || !to || from > to) return;
    const ctrl = new AbortController();
    setCounts(null);
    nalogApi.getCountsReport(startOf(from), endOf(to), ctrl.signal).then(setCounts).catch(() => {});
    return () => ctrl.abort();
  }, [from, to]);

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

  // Prints only the counts section: the page is marked while the print dialog is open, and the CSS below hides everything else.
  function printCounts() {
    document.body.classList.add('print-counts');
    window.addEventListener('afterprint', () => document.body.classList.remove('print-counts'), { once: true });
    window.print();
  }

  const preset = (a: Date, b: Date) => { setFrom(dateInput(a)); setTo(dateInput(b)); };

  // The technician filter: the same dropdown as everywhere else. The server groups by name, so the rows are matched by name.
  const pickedName = technicians.find((x) => String(x.id) === techFilter)?.name;
  const shown: CountsReport | null = counts && (pickedName
    ? (() => {
        const rows = counts.rows.filter((r) => r.technician === pickedName);
        const byStatus: Record<string, number> = {};
        rows.forEach((r) => Object.entries(r.byStatus).forEach(([k, v]) => { byStatus[k] = (byStatus[k] ?? 0) + v; }));
        return { ...counts, rows, totals: { technician: '', byStatus, total: rows.reduce((n, r) => n + r.total, 0) } };
      })()
    : counts);

  return (
    <div className="rep">
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

      <style>{`@media print { aside, .no-print { display: none !important; } main { padding: 0 !important; } body.print-counts .rep > :not(.sec-counts) { display: none !important; } }`}</style>
      <div style={{ fontSize: 12.5, color: 'var(--stone)', marginBottom: 16 }}>{t('reports_note')}</div>

      {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {/* ---- nalozi per worker, by status ---- */}
      <div className="sec-counts">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 8px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>{t('reports_countsTitle')} ({from} – {to})</h2>
          <select className="input no-print" style={{ width: 'auto' }} value={techFilter} onChange={(e) => setTechFilter(e.target.value)}>
            <option value="">{t('stockDoc_allTechnicians')}</option>
            {technicians.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <button className="btn-secondary btn-sm no-print" onClick={printCounts}>{t('stockDoc_print')}</button>
        </div>
        {shown && shown.rows.length > 0 ? <CountsTable report={shown} /> : (
          <div style={{ fontSize: 13, color: 'var(--stone)' }}>{shown ? t('reports_none') : <Spinner label={t('jobBoard_loading')} />}</div>
        )}
      </div>
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
