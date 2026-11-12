import { useCallback, useEffect, useMemo, useState } from 'react';
import { nalogApi } from '../api/nalog';
import { NalogApiError } from '../api/nalogApi';
import { BulkBar } from '../components/BulkBar';
import Modal from '../components/Modal';
import { SelectBox } from '../components/SelectBox';
import Spinner from '../components/Spinner';
import { useCurrentUser } from '../context/typedAuth';
import { useLang } from '../i18n/typedLang';
import { useSelection } from '../hooks/useSelection';
import { formatMoney } from '../print/formatMoney';
import type { PageResponse, PartResponse, StockMovementView } from '../types/nalog';
import { isAdminLevel } from '../context/roles';


const PAGE_SIZE = 25;

/** "1234,5" -> "1234.5". Pure string handling: money never becomes a JS number (RULE A). */
const normalizePrice = (v: string) => v.trim().replace(',', '.');
const PRICE_RE = /^\d{1,10}(\.\d{1,2})?$/;

const errText = (e: unknown, fallback: string) => (e instanceof NalogApiError ? e.message : fallback);

export default function Parts() {
  const { t } = useLang();
  const isAdmin = isAdminLevel(useCurrentUser()?.role);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');           // debounced copy of q
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageResponse<PartResponse> | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<PartResponse | 'new' | null>(null);
  const [adjusting, setAdjusting] = useState<PartResponse | null>(null);
  const [history, setHistory] = useState<PartResponse | null>(null);

  useEffect(() => {
    const id = setTimeout(() => { setQuery(q); setPage(0); }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setData(await nalogApi.searchParts(query, { onlyActive: !showInactive, page, size: PAGE_SIZE }, signal));
      setError('');
    } catch (e) {
      if (e instanceof NalogApiError && e.message !== 'Request cancelled') setError(e.message);
    }
  }, [query, showInactive, page]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const reload = () => { setData(null); load(); };

  // Row selection: deactivate / reactivate several parts at once (admin only)
  const pageIds = useMemo(() => data?.items.map((p) => p.id) ?? [], [data]);
  const sel = useSelection(isAdmin ? pageIds : []);
  const [bulkBusy, setBulkBusy] = useState(false);

  async function bulkActive(active: boolean) {
    setBulkBusy(true);
    try {
      await nalogApi.bulkSetPartsActive(sel.selectedIds, active);
      sel.clear();
      await load();
    } catch (e) {
      setError(errText(e, t('nalogForm_unexpected')));
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, flex: 1 }}>{t('parts_title')}</h1>
        <button className="btn" onClick={() => setEditing('new')}>{t('parts_new')}</button>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <input className="input" style={{ maxWidth: 320 }} value={q} placeholder={t('parts_search')}
               onChange={(e) => setQ(e.target.value)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, fontSize: 13 }}>
          <input type="checkbox" checked={showInactive}
                 onChange={(e) => { setShowInactive(e.target.checked); setPage(0); }} />
          {t('parts_showInactive')}
        </label>
      </div>

      {isAdmin && sel.count > 0 && (
        <BulkBar count={sel.count} onClear={sel.clear}>
          <button type="button" className="btn-secondary btn-sm" disabled={bulkBusy} onClick={() => bulkActive(true)}>{t('bulk_activate')}</button>
          <button type="button" className="btn-secondary btn-sm" disabled={bulkBusy} onClick={() => bulkActive(false)}>{t('bulk_deactivate')}</button>
        </BulkBar>
      )}

      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {!data ? <Spinner label={t('jobBoard_loading')} /> : data.items.length === 0 ? (
        <div className="card" style={{ padding: 24, color: 'var(--stone)', textAlign: 'center' }}>{t('parts_empty')}</div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--stone)', fontSize: 12 }}>
                {isAdmin && (
                  <th style={{ padding: '10px 0 10px 14px', width: 32 }}>
                    <SelectBox checked={sel.allSelected} indeterminate={sel.someSelected} onChange={sel.toggleAll} label={t('bulk_selectAll')} />
                  </th>
                )}
                <th style={{ padding: '10px 14px' }}>{t('parts_sku')}</th>
                <th>{t('parts_name')}</th>
                <th style={{ textAlign: 'right' }}>{t('parts_price')}</th>
                <th style={{ textAlign: 'right' }}>{t('parts_stock')}</th>
                <th style={{ padding: '0 14px' }}>{t('parts_status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)', opacity: p.active ? 1 : 0.55,
                                        background: sel.isSelected(p.id) ? 'var(--paper)' : undefined }}>
                  {isAdmin && (
                    <td style={{ padding: '9px 0 9px 14px' }}>
                      <SelectBox checked={sel.isSelected(p.id)} onChange={() => sel.toggle(p.id)} label={t('bulk_selectRow')} />
                    </td>
                  )}
                  <td style={{ padding: '9px 14px', fontFamily: 'var(--mono)' }}>{p.sku}</td>
                  <td>{p.name}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{formatMoney(p.unitPrice)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600,
                               color: p.stockQty === 0 ? 'var(--danger)' : undefined }}>
                    {p.stockQty}
                    {p.stockQty === 0 && p.active && (
                      <div style={{ fontSize: 11, fontWeight: 500 }}>{t('parts_outOfStock')}</div>
                    )}
                  </td>
                  <td style={{ padding: '0 14px' }}>{p.active ? t('parts_active') : t('parts_inactive')}</td>
                  <td style={{ whiteSpace: 'nowrap', padding: '0 14px', textAlign: 'right' }}>
                    <button className="btn-secondary btn-xs" onClick={() => setEditing(p)}>{t('parts_edit')}</button>{' '}
                    <button className="btn-secondary btn-xs" onClick={() => setAdjusting(p)}>{t('parts_adjust')}</button>{' '}
                    <button className="btn-secondary btn-xs" onClick={() => setHistory(p)}>{t('parts_history')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 14, fontSize: 13 }}>
          <button className="btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('parts_prev')}</button>
          <span>{page + 1} / {data.totalPages}</span>
          <button className="btn-secondary btn-sm" disabled={page + 1 >= data.totalPages} onClick={() => setPage(page + 1)}>{t('parts_next')}</button>
        </div>
      )}

      {editing && <PartFormModal part={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
                                 onSaved={() => { setEditing(null); reload(); }} />}
      {adjusting && <AdjustModal part={adjusting} onClose={() => setAdjusting(null)}
                                 onSaved={() => { setAdjusting(null); reload(); }} />}
      {history && <HistoryModal part={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function PartFormModal({ part, onClose, onSaved }: { part: PartResponse | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const creating = part === null;
  const [sku, setSku] = useState(part?.sku ?? '');
  const [name, setName] = useState(part?.name ?? '');
  const [price, setPrice] = useState(part?.unitPrice ?? '');
  const [stock, setStock] = useState('0');
  const [active, setActive] = useState(part?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const unitPrice = normalizePrice(price);
    if (creating && (!sku.trim() || sku.trim().length > 60)) return setError(t('parts_err_sku'));
    if (!name.trim() || name.trim().length > 200) return setError(t('parts_err_name'));
    if (unitPrice && !PRICE_RE.test(unitPrice)) return setError(t('parts_err_price'));
    if (creating && !/^\d{1,7}$/.test(stock.trim())) return setError(t('parts_err_stock'));
    const initial = creating ? Number(stock.trim()) : 0;
    if (initial > 1_000_000) return setError(t('parts_err_stock'));
    setBusy(true); setError('');
    try {
      if (creating) await nalogApi.createPart({ sku: sku.trim(), name: name.trim(), unitPrice: unitPrice || null, stockQty: initial });
      else await nalogApi.updatePart(part.id, { name: name.trim(), unitPrice: unitPrice || null, active });
      onSaved();
    } catch (err) {
      setError(errText(err, t('nalogForm_unexpected')));
      setBusy(false);
    }
  }

  return (
    <Modal title={creating ? t('parts_createTitle') : t('parts_editTitle')} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div className="field">
          <label>{t('parts_sku')}</label>
          <input className="input" value={sku} maxLength={60} disabled={!creating} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('parts_name')}</label>
          <input className="input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('parts_price')}</label>
          <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          {!creating && <div style={{ fontSize: 11.5, color: 'var(--stone)', marginTop: 4 }}>{t('parts_priceNote')}</div>}
        </div>
        {creating ? (
          <div className="field">
            <label>{t('parts_initialStock')}</label>
            <input className="input" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} />
          </div>
        ) : (
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              {t('parts_active')}
            </label>
            {!active && <div style={{ fontSize: 11.5, color: 'var(--stone)' }}>{t('parts_discontinuedNote')}</div>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>{t('common_cancel')}</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? t('parts_saving') : t('parts_save')}</button>
        </div>
      </form>
    </Modal>
  );
}

function AdjustModal({ part, onClose, onSaved }: { part: PartResponse; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const raw = delta.trim().replace('−', '-');            // allow the typographic minus too
    if (!/^[+-]?\d{1,7}$/.test(raw) || Number(raw) === 0 || Math.abs(Number(raw)) > 1_000_000) return setError(t('parts_err_delta'));
    setBusy(true); setError('');
    try {
      await nalogApi.adjustStock(part.id, { delta: Number(raw), note: note.trim() || null });
      onSaved();
    } catch (err) {
      setError(errText(err, t('nalogForm_unexpected')));
      setBusy(false);
    }
  }

  return (
    <Modal title={`${t('parts_adjustTitle')} · ${part.sku}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div style={{ fontSize: 13.5, marginBottom: 14 }}>
          {part.name}<br />
          <span style={{ color: 'var(--stone)' }}>{t('parts_adjustCurrent')}: </span>
          <b style={{ fontFamily: 'var(--mono)' }}>{part.stockQty}</b>
        </div>
        <div className="field">
          <label>{t('parts_delta')}</label>
          <input className="input" inputMode="numeric" value={delta} placeholder="+10 / -2" autoFocus
                 onChange={(e) => setDelta(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('parts_note')}</label>
          <input className="input" value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>{t('common_cancel')}</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? t('parts_saving') : t('parts_adjustApply')}</button>
        </div>
      </form>
    </Modal>
  );
}

function HistoryModal({ part, onClose }: { part: PartResponse; onClose: () => void }) {
  const { t, lang } = useLang();
  const [rows, setRows] = useState<StockMovementView[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    nalogApi.listStockMovements(part.id, ctrl.signal)
      .then(setRows)
      .catch((e) => { if (!(e instanceof NalogApiError && e.message === 'Request cancelled')) setError(errText(e, t('nalogForm_unexpected'))); });
    return () => ctrl.abort();
  }, [part.id, t]);

  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === 'sr' ? 'sr-Latn-RS' : 'en-GB');

  return (
    <Modal title={`${t('parts_historyTitle')} · ${part.sku}`} onClose={onClose} width={640}>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
      {!rows && !error && <Spinner label={t('jobBoard_loading')} />}
      {rows && rows.length === 0 && <div style={{ color: 'var(--stone)' }}>{t('parts_historyEmpty')}</div>}
      {rows && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--stone)', fontSize: 12 }}>
                <th>{t('parts_when')}</th><th style={{ textAlign: 'right' }}>{t('parts_change')}</th>
                <th style={{ paddingLeft: 14 }}>{t('parts_reason')}</th><th>{t('parts_by')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 0', whiteSpace: 'nowrap' }}>{fmt(m.createdAt)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600,
                               color: m.delta < 0 ? 'var(--danger)' : 'var(--green)' }}>
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </td>
                  <td style={{ paddingLeft: 14 }}>
                    {t(`parts_reason_${m.reason}`)}
                    {m.note && <div style={{ fontSize: 11.5, color: 'var(--stone)' }}>{m.note}</div>}
                  </td>
                  <td>{m.actorName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
