import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nalogApi } from '../api/nalog';
import { NalogApiError } from '../api/nalogApi';
import ConfirmDialog from '../components/ConfirmDialog';
import Spinner from '../components/Spinner';
import { useCurrentUser } from '../context/typedAuth';
import { isAdminLevel } from '../context/roles';
import { useLang } from '../i18n/typedLang';
import type { CarriedView, PartResponse, TechnicianView } from '../types/nalog';

const MAX_ITEMS = 50;
const QTY_RE = /^\d{1,7}$/;

const errText = (e: unknown, fallback: string) => (e instanceof NalogApiError ? e.message : fallback);

/**
 * Zaduzivanje / razduzivanje: the list of material a technician carries. Items are picked from the Magacin catalog
 * (read only: code and name are copied, stock is NOT changed), or typed freely for things that are not in Magacin.
 */
export default function Carried() {
  const { t } = useLang();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const isAdmin = isAdminLevel(user?.role);

  const [technicians, setTechnicians] = useState<TechnicianView[]>([]);
  const [techId, setTechId] = useState<number | null>(isAdmin ? null : (user?.id ?? null));
  const [items, setItems] = useState<CarriedView[] | null>(null);
  const [error, setError] = useState('');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [busy, setBusy] = useState(false);
  const [magQuery, setMagQuery] = useState('');
  const [magResults, setMagResults] = useState<PartResponse[]>([]);
  const [deleting, setDeleting] = useState<CarriedView | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const ctrl = new AbortController();
    nalogApi.listTechnicians(ctrl.signal).then((list) => {
      setTechnicians(list);
      setTechId((cur) => cur ?? list[0]?.id ?? null);
    }).catch(() => {});
    return () => ctrl.abort();
  }, [isAdmin]);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (techId == null) return;
    try {
      setItems(await nalogApi.listCarried(isAdmin ? techId : undefined, signal));
      setError('');
    } catch (e) {
      if (e instanceof NalogApiError && e.message !== 'Request cancelled') setError(e.message);
    }
  }, [techId, isAdmin]);

  useEffect(() => {
    setItems(null);
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // Debounced Magacin lookup (same search as the nalog form, active parts only).
  useEffect(() => {
    if (magQuery.trim().length < 2) { setMagResults([]); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      nalogApi.searchParts(magQuery.trim(), { onlyActive: true, size: 8 }, ctrl.signal)
        .then((page) => setMagResults(page.items))
        .catch(() => { /* next keystroke retries */ });
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [magQuery]);

  function pickPart(p: PartResponse) {
    setSku(p.sku); setName(p.name);
    setMagQuery(''); setMagResults([]);
    setError('');
  }

  function resetForm() {
    setEditingId(null); setSku(''); setName(''); setQty('1'); setMagQuery(''); setMagResults([]);
  }

  function startEdit(c: CarriedView) {
    setEditingId(c.id); setSku(c.sku ?? ''); setName(c.name); setQty(String(c.quantity));
    setError('');
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError(t('carried_nameRequired')); return; }
    if (!QTY_RE.test(qty.trim()) || Number(qty) > 1_000_000) { setError(t('carried_qtyInvalid')); return; }
    const req = { sku: sku.trim() || null, name: name.trim(), quantity: Number(qty), technicianId: isAdmin ? techId : null };
    setBusy(true);
    try {
      if (editingId == null) await nalogApi.addCarried(req); else await nalogApi.updateCarried(editingId, req);
      resetForm();
      setError('');
      await load();
    } catch (err) {
      setError(errText(err, t('nalogForm_unexpected')));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await nalogApi.deleteCarried(deleting.id);
      if (editingId === deleting.id) resetForm();
      setDeleting(null);
      await load();
    } catch (err) {
      setError(errText(err, t('nalogForm_unexpected')));
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  const printUrl = isAdmin && techId != null ? `/carried/print?technicianId=${techId}` : '/carried/print';
  const full = (items?.length ?? 0) >= MAX_ITEMS && editingId == null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, flex: 1 }}>{t('carried_title')}</h1>
        <button className="btn-secondary" disabled={!items || items.length === 0} onClick={() => navigate(printUrl)}>{t('carried_print')}</button>
      </div>

      {isAdmin && (
        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ margin: 0, fontSize: 13 }}>{t('carried_technician')}</label>
          <select className="input" style={{ maxWidth: 260 }} value={techId ?? ''}
                  onChange={(e) => { resetForm(); setTechId(e.target.value ? Number(e.target.value) : null); }}>
            {technicians.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
      )}

      <form onSubmit={save} className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flexBasis: '100%', position: 'relative' }}>
          <label style={{ fontSize: 12 }}>{t('carried_fromMagacin')}</label>
          <input className="input" placeholder={t('carried_searchMagacin')} value={magQuery} onChange={(e) => setMagQuery(e.target.value)} />
          {magResults.length > 0 && (
            <div className="card" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, top: '100%', marginTop: 2, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
              {magResults.map((p) => (
                <button key={p.id} type="button" onClick={() => pickPart(p)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                  <strong>{p.name}</strong>
                  <span style={{ color: 'var(--stone)', fontSize: 12.5 }}> · {p.sku} · {p.stockQty} {t('nalogForm_stockLabel')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ width: 130 }}>
          <label style={{ fontSize: 12 }}>{t('carried_sku')}</label>
          <input className="input" value={sku} maxLength={60} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 12 }}>{t('carried_name')}</label>
          <input className="input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ width: 100 }}>
          <label style={{ fontSize: 12 }}>{t('carried_quantity')}</label>
          <input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={busy || techId == null || full}>
          {editingId == null ? t('carried_add') : t('carried_save')}
        </button>
        {editingId != null && <button className="btn-secondary" type="button" onClick={resetForm}>{t('common_cancel')}</button>}
      </form>

      {full && <div style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 12 }}>{t('carried_limit')}</div>}
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {techId == null ? (
        <div className="card" style={{ padding: 24, color: 'var(--stone)', textAlign: 'center' }}>{t('carried_noTechnician')}</div>
      ) : !items ? <Spinner label={t('jobBoard_loading')} /> : items.length === 0 ? (
        <div className="card" style={{ padding: 24, color: 'var(--stone)', textAlign: 'center' }}>{t('carried_empty')}</div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--stone)', fontSize: 12 }}>
                <th style={{ padding: '10px 14px' }}>{t('carried_sku')}</th>
                <th>{t('carried_name')}</th>
                <th style={{ textAlign: 'right' }}>{t('carried_quantity')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 14px', fontFamily: 'var(--mono)' }}>{c.sku ?? ''}</td>
                  <td>{c.name}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>{c.quantity}</td>
                  <td style={{ whiteSpace: 'nowrap', padding: '0 14px', textAlign: 'right' }}>
                    <button className="btn-secondary btn-xs" onClick={() => startEdit(c)}>{t('carried_edit')}</button>{' '}
                    <button className="btn-secondary btn-xs" onClick={() => setDeleting(c)}>{t('common_delete')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleting && (
        <ConfirmDialog message={t('carried_deleteConfirm')} busy={busy} onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />
      )}
    </div>
  );
}
