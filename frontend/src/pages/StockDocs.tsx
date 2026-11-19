import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nalogApi } from '../api/nalog';
import { NalogApiError } from '../api/nalogApi';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import { useLang } from '../i18n/typedLang';
import type { PageResponse, PartResponse, StockDocSummary, StockDocType, StockDocView, StockRevisionView, TechnicianView } from '../types/nalog';

const PAGE_SIZE = 20;
const QTY_RE = /^\d{1,9}([.,]\d{1,3})?$/;

interface Line { partId: number; sku: string | null; name: string; unit: string; quantity: string }

const errText = (e: unknown, fallback: string) => (e instanceof NalogApiError ? e.message : fallback);

/** ISO instant -> value for <input type="datetime-local"> (local time). */
const toLocalInput = (iso: string | Date) => {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Zaduzenje / Razduzenje (one page for both, chosen by `type`; the old software's screen is the model):
 * technician, date and time, a part found by search only, quantity, the item grid, Snimi / Odustani.
 * Documents are numbered by the server and never deleted; an edit keeps the old version in the history.
 * Admin and manager only: a technician reads his own documents on the phone.
 */
export default function StockDocs({ type }: { type: StockDocType }) {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const word = type === 'ZAD' ? 'zad' : 'raz';

  const [technicians, setTechnicians] = useState<TechnicianView[]>([]);
  const [editing, setEditing] = useState<StockDocView | null>(null);
  const [techId, setTechId] = useState<number | null>(null);
  const [docAt, setDocAt] = useState(() => toLocalInput(new Date()));
  const [lines, setLines] = useState<Line[]>([]);
  const [saved, setSaved] = useState<StockDocView | null>(null);

  const [q, setQ] = useState('');
  const [results, setResults] = useState<PartResponse[]>([]);
  const [picked, setPicked] = useState<PartResponse | null>(null);
  const [qty, setQty] = useState('1');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [fTech, setFTech] = useState<number | ''>('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [page, setPage] = useState(0);
  const [list, setList] = useState<PageResponse<StockDocSummary> | null>(null);
  const [revisionsFor, setRevisionsFor] = useState<StockDocSummary | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    nalogApi.listTechnicians(ctrl.signal).then((l) => { setTechnicians(l); setTechId((cur) => cur ?? l[0]?.id ?? null); }).catch(() => {});
    return () => ctrl.abort();
  }, []);

  // The two tabs share this component: switching tab starts a clean form.
  useEffect(() => { reset(); setPage(0); setList(null); }, [type]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Search only (no pick-list): nothing is shown until something is typed.
  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      nalogApi.searchParts(q.trim(), { onlyActive: true, size: 15 }, ctrl.signal)
        .then((p) => setResults(p.items)).catch(() => {});
    }, 250);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [q]);

  const dayStart = (d: string) => new Date(`${d}T00:00:00`).toISOString();
  const dayAfter = (d: string) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + 1); return x.toISOString(); };

  const loadList = useCallback(async (signal?: AbortSignal) => {
    try {
      setList(await nalogApi.listStockDocs({
        type, page, size: PAGE_SIZE,
        ...(fTech !== '' ? { technicianId: fTech } : {}),
        ...(fFrom ? { from: dayStart(fFrom) } : {}),
        ...(fTo ? { to: dayAfter(fTo) } : {}),
      }, signal));
    } catch (e) {
      if (e instanceof NalogApiError && e.message !== 'Request cancelled') setError(e.message);
    }
  }, [type, page, fTech, fFrom, fTo]);

  useEffect(() => {
    const ctrl = new AbortController();
    loadList(ctrl.signal);
    return () => ctrl.abort();
  }, [loadList]);

  function reset() {
    setEditing(null); setLines([]); setSaved(null); setQ(''); setPicked(null); setQty('1'); setError('');
    setDocAt(toLocalInput(new Date()));
  }

  function pick(p: PartResponse) {
    setPicked(p); setQ(''); setResults([]); setError('');
  }

  function addLine() {
    if (!picked) { setError(t('stockDoc_pickPart')); return; }
    if (!QTY_RE.test(qty.trim()) || Number(qty.replace(',', '.')) <= 0) { setError(t('stockDoc_qtyInvalid')); return; }
    if (lines.length >= 100) { setError(t('stockDoc_tooMany')); return; }
    setLines((cur) => [...cur, { partId: picked.id, sku: picked.sku, name: picked.name, unit: picked.unit, quantity: qty.trim().replace(',', '.') }]);
    setPicked(null); setQty('1'); setError('');
  }

  async function save() {
    if (busy) return;
    if (techId == null) { setError(t('stockDoc_techRequired')); return; }
    if (lines.length === 0) { setError(t('stockDoc_linesRequired')); return; }
    if (!docAt) { setError(t('stockDoc_dateRequired')); return; }
    setBusy(true); setError('');
    try {
      const body = { technicianId: techId, docAt: new Date(docAt).toISOString(), lines: lines.map((l) => ({ partId: l.partId, quantity: l.quantity })) };
      const doc = editing
        ? await nalogApi.updateStockDoc(editing.id, body)
        : await nalogApi.createStockDoc({ type, ...body });
      setSaved(doc);
      setEditing(null); setLines([]); setPicked(null); setQ('');
      setDocAt(toLocalInput(new Date()));
      await loadList();
    } catch (e) {
      setError(errText(e, t('nalogForm_unexpected')));
    } finally {
      setBusy(false);
    }
  }

  async function open(s: StockDocSummary) {
    setError('');
    try {
      const d = await nalogApi.getStockDoc(s.id);
      setEditing(d); setSaved(null); setTechId(d.technicianId); setDocAt(toLocalInput(d.docAt));
      setLines(d.lines.filter((l) => l.partId != null).map((l) => ({ partId: l.partId as number, sku: l.sku, name: l.name, unit: l.unit, quantity: l.quantity })));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(errText(e, t('nalogForm_unexpected')));
    }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === 'sr' ? 'sr-Latn-RS' : 'en-GB');
  const printAllUrl = () => {
    const p = new URLSearchParams({ type });
    if (fTech !== '') p.set('technicianId', String(fTech));
    if (fFrom) p.set('from', dayStart(fFrom));
    if (fTo) p.set('to', dayAfter(fTo));
    return `/stock-docs/print?${p.toString()}`;
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 16px' }}>{t(`stockDoc_title_${word}`)}</h1>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
          {editing ? `${t(`stockDoc_edit_${word}`)} ${editing.docNo}` : t(`stockDoc_new_${word}`)}
          {!editing && <span style={{ fontWeight: 400, color: 'var(--stone)', fontSize: 12.5 }}> · {t('stockDoc_numberAuto')}</span>}
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ width: 230 }}>
            <label style={{ fontSize: 12 }}>{t('stockDoc_datetime')}</label>
            <input className="input" type="datetime-local" value={docAt} onChange={(e) => setDocAt(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontSize: 12 }}>{t('stockDoc_technician')}</label>
            <select className="input" value={techId ?? ''} onChange={(e) => setTechId(e.target.value ? Number(e.target.value) : null)}>
              {technicians.length === 0 && <option value="">—</option>}
              {technicians.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', position: 'relative' }}>
          <div style={{ flex: 2, minWidth: 260, position: 'relative' }}>
            <label style={{ fontSize: 12 }}>{t('stockDoc_search')}</label>
            <input className="input" value={q} placeholder={t('stockDoc_searchPlaceholder')} onChange={(e) => setQ(e.target.value)} />
            {results.length > 0 && (
              <div className="card" style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20, maxHeight: 260, overflowY: 'auto' }}>
                {results.map((p) => (
                  <button key={p.id} type="button" onClick={() => pick(p)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <span style={{ fontFamily: 'var(--mono)' }}>{p.sku}</span> · <strong>{p.name}</strong>
                    <span style={{ color: 'var(--stone)', fontSize: 12 }}> · {p.unit}</span>
                  </button>
                ))}
              </div>
            )}
            {q.trim() && results.length === 0 && <div style={{ fontSize: 12, color: 'var(--stone)', marginTop: 4 }}>{t('stockDoc_noResults')}</div>}
          </div>
          <div style={{ width: 120 }}>
            <label style={{ fontSize: 12 }}>{t('stockDoc_sku')}</label>
            <input className="input" readOnly value={picked?.sku ?? ''} />
          </div>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label style={{ fontSize: 12 }}>{t('stockDoc_partName')}</label>
            <input className="input" readOnly value={picked?.name ?? ''} />
          </div>
          <div style={{ width: 110 }}>
            <label style={{ fontSize: 12 }}>{t('stockDoc_quantity')}{picked ? ` (${picked.unit})` : ''}</label>
            <input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLine(); } }} />
          </div>
          <button type="button" className="btn-secondary" onClick={addLine}>{t('stockDoc_addLine')}</button>
        </div>

        <div style={{ marginTop: 16, fontSize: 13, fontWeight: 600 }}>{t('stockDoc_items')}</div>
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 4, marginTop: 6 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--stone)', fontSize: 12 }}>
                <th style={{ padding: '8px 12px' }}>{t('stockDoc_sku')}</th>
                <th>{t('stockDoc_partName')}</th>
                <th style={{ textAlign: 'right' }}>{t('stockDoc_quantity')}</th>
                <th style={{ paddingLeft: 10 }}>{t('stockDoc_unit')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 14, color: 'var(--stone)', textAlign: 'center' }}>{t('stockDoc_noItems')}</td></tr>
              )}
              {lines.map((l, i) => (
                <tr key={`${l.partId}-${i}`} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '7px 12px', fontFamily: 'var(--mono)' }}>{l.sku}</td>
                  <td>{l.name}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>{l.quantity}</td>
                  <td style={{ paddingLeft: 10 }}>{l.unit}</td>
                  <td style={{ textAlign: 'right', padding: '0 12px' }}>
                    {/* removes the line from this form only; a saved document itself can never be deleted */}
                    <button type="button" className="btn-secondary btn-xs" onClick={() => setLines((cur) => cur.filter((_, k) => k !== i))}>{t('stockDoc_removeLine')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</div>}
        {saved && (
          <div style={{ marginTop: 10, fontSize: 13.5 }}>
            {t(`stockDoc_saved_${word}`)} <b>{saved.docNo}</b>{' '}
            <button type="button" className="btn-secondary btn-xs" onClick={() => navigate(`/stock-docs/print?id=${saved.id}`)}>{t('stockDoc_print')}</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button type="button" className="btn" disabled={busy} onClick={save}>{busy ? t('parts_saving') : t('stockDoc_save')}</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={reset}>{t('stockDoc_discard')}</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 12 }}>{t('stockDoc_technician')}</label>
          <select className="input" value={fTech} onChange={(e) => { setFTech(e.target.value ? Number(e.target.value) : ''); setPage(0); }}>
            <option value="">{t('stockDoc_allTechnicians')}</option>
            {technicians.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12 }}>{t('stockDoc_from')}</label>
          <input className="input" type="date" value={fFrom} onChange={(e) => { setFFrom(e.target.value); setPage(0); }} />
        </div>
        <div>
          <label style={{ fontSize: 12 }}>{t('stockDoc_to')}</label>
          <input className="input" type="date" value={fTo} onChange={(e) => { setFTo(e.target.value); setPage(0); }} />
        </div>
        <button type="button" className="btn-secondary" disabled={!list || list.totalItems === 0} onClick={() => navigate(printAllUrl())}>{t('stockDoc_printAll')}</button>
      </div>

      {!list ? <Spinner label={t('jobBoard_loading')} /> : list.items.length === 0 ? (
        <div className="card" style={{ padding: 24, color: 'var(--stone)', textAlign: 'center' }}>{t('stockDoc_empty')}</div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--stone)', fontSize: 12 }}>
                <th style={{ padding: '10px 14px' }}>{t('stockDoc_no')}</th>
                <th>{t('stockDoc_datetime')}</th>
                <th>{t('stockDoc_technician')}</th>
                <th style={{ textAlign: 'right' }}>{t('stockDoc_itemsCount')}</th>
                <th style={{ paddingLeft: 14 }}>{t('stockDoc_issuedBy')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.items.map((d) => (
                <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 14px', fontFamily: 'var(--mono)', fontWeight: 600 }}>{d.docNo}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmt(d.docAt)}</td>
                  <td>{d.technicianName}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{d.lineCount}</td>
                  <td style={{ paddingLeft: 14 }}>{d.createdByName}</td>
                  <td style={{ whiteSpace: 'nowrap', padding: '0 14px', textAlign: 'right' }}>
                    <button className="btn-secondary btn-xs" onClick={() => open(d)}>{t('stockDoc_open')}</button>{' '}
                    <button className="btn-secondary btn-xs" onClick={() => navigate(`/stock-docs/print?id=${d.id}`)}>{t('stockDoc_print')}</button>{' '}
                    <button className="btn-secondary btn-xs" onClick={() => setRevisionsFor(d)}>{t('stockDoc_revisions')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list && list.totalPages > 1 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 14, fontSize: 13 }}>
          <button className="btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('parts_prev')}</button>
          <span>{page + 1} / {list.totalPages}</span>
          <button className="btn-secondary btn-sm" disabled={page + 1 >= list.totalPages} onClick={() => setPage(page + 1)}>{t('parts_next')}</button>
        </div>
      )}

      {revisionsFor && <RevisionsModal doc={revisionsFor} onClose={() => setRevisionsFor(null)} fmt={fmt} />}
    </div>
  );
}

function RevisionsModal({ doc, onClose, fmt }: { doc: StockDocSummary; onClose: () => void; fmt: (iso: string) => string }) {
  const { t } = useLang();
  const [rows, setRows] = useState<StockRevisionView[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    nalogApi.listStockRevisions(doc.id, ctrl.signal).then(setRows)
      .catch((e) => { if (!(e instanceof NalogApiError && e.message === 'Request cancelled')) setError(errText(e, t('nalogForm_unexpected'))); });
    return () => ctrl.abort();
  }, [doc.id, t]);

  return (
    <Modal title={`${t('stockDoc_revisionsTitle')} · ${doc.docNo}`} onClose={onClose} width={640}>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
      {!rows && !error && <Spinner label={t('jobBoard_loading')} />}
      {rows && rows.length === 0 && <div style={{ color: 'var(--stone)' }}>{t('stockDoc_revisionsEmpty')}</div>}
      {rows && rows.map((r, i) => (
        <div key={i} style={{ borderTop: i ? '1px solid var(--border)' : 'none', padding: '8px 0', fontSize: 13 }}>
          <div style={{ color: 'var(--stone)', fontSize: 12 }}>{fmt(r.revisedAt)} · {r.revisedByName}</div>
          <div>{r.snapshot}</div>
        </div>
      ))}
    </Modal>
  );
}
