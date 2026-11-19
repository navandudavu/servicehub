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
import type { ImportResult, PageResponse, PartResponse } from '../types/nalog';
import { isAdminLevel } from '../context/roles';


const PAGE_SIZE = 25;

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
  const [importing, setImporting] = useState(false);

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
        {isAdmin && <button className="btn-secondary" onClick={() => setImporting(true)}>{t('parts_import')}</button>}
        {isAdmin && <button className="btn" onClick={() => setEditing('new')}>{t('parts_new')}</button>}
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
                <th>{t('parts_unit')}</th>
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
                  <td>{p.unit}</td>
                  <td style={{ padding: '0 14px' }}>{p.active ? t('parts_active') : t('parts_inactive')}</td>
                  <td style={{ whiteSpace: 'nowrap', padding: '0 14px', textAlign: 'right' }}>
                    {isAdmin && <button className="btn-secondary btn-xs" onClick={() => setEditing(p)}>{t('parts_edit')}</button>}{' '}
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
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => { reload(); }} />}
    </div>
  );
}

function PartFormModal({ part, onClose, onSaved }: { part: PartResponse | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const creating = part === null;
  const [sku, setSku] = useState(part?.sku ?? '');
  const [name, setName] = useState(part?.name ?? '');
  const [unit, setUnit] = useState(part?.unit ?? 'kom');
  const [active, setActive] = useState(part?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (creating && (!sku.trim() || sku.trim().length > 60)) return setError(t('parts_err_sku'));
    if (!name.trim() || name.trim().length > 200) return setError(t('parts_err_name'));
    if (unit.trim().length > 20) return setError(t('parts_err_unit'));
    setBusy(true); setError('');
    try {
      if (creating) await nalogApi.createPart({ sku: sku.trim(), name: name.trim(), unit: unit.trim() || null });
      else await nalogApi.updatePart(part.id, { name: name.trim(), active, unit: unit.trim() || null });
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
          <label>{t('parts_unit')}</label>
          <input className="input" value={unit} maxLength={20} onChange={(e) => setUnit(e.target.value)} />
        </div>
        {!creating && (
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

/** Import the Magacin from a CSV file: a CSV file with sifra;naziv;jedinica mere. Importing a file again only updates the same rows. */
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useLang();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    // CSV exports from older Windows programs are often Windows-1250, not UTF-8: try UTF-8 strictly, fall back to 1250 so the letters survive.
    const buf = await f.arrayBuffer();
    try { setCsv(new TextDecoder('utf-8', { fatal: true }).decode(buf)); }
    catch { setCsv(new TextDecoder('windows-1250').decode(buf)); }
    setResult(null);
    setError('');
  }

  async function submit() {
    if (busy || !csv.trim()) return;
    setBusy(true); setError('');
    try {
      setResult(await nalogApi.importParts(csv));
      onDone();
    } catch (err) {
      setError(errText(err, t('nalogForm_unexpected')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('parts_importTitle')} onClose={onClose} width={560}>
      <div style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 12 }}>{t('parts_importHelp')}</div>
      <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={pick} />
      {fileName && <div style={{ fontSize: 12.5, marginTop: 6 }}>{fileName}</div>}
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</div>}
      {result && (
        <div style={{ fontSize: 13.5, marginTop: 12 }}>
          <div>{t('parts_importCreated')}: <b>{result.created}</b> · {t('parts_importUpdated')}: <b>{result.updated}</b></div>
          {result.skipped.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: 'var(--danger)' }}>{t('parts_importSkipped')}: {result.skipped.length}</div>
              <ul style={{ maxHeight: 140, overflowY: 'auto', fontSize: 12.5, margin: '4px 0 0', paddingLeft: 18 }}>
                {result.skipped.slice(0, 50).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" className="btn-secondary" onClick={onClose}>{t('parts_importClose')}</button>
        <button type="button" className="btn" disabled={busy || !csv.trim()} onClick={submit}>{busy ? t('parts_saving') : t('parts_importRun')}</button>
      </div>
    </Modal>
  );
}
