import { useCallback, useEffect, useState } from 'react';
import { nalogApi } from '../api/nalog';
import { NalogApiError } from '../api/nalogApi';
import { useLang } from '../i18n/typedLang';
import type { HeldPart, MaterialLine } from '../types/nalog';

const QTY_RE = /^\d{1,9}([.,]\d{1,3})?$/;
const norm = (q: string) => q.trim().replace(',', '.');

/**
 * Materijal of a nalog: using material is an automatic Razduzenje of the technician the nalog belongs to.
 * Parts are found by search among the parts that technician holds (no quantity is shown anywhere), and the server refuses
 * more than he holds. `canAdd`: technician (own nalog) and admin-level users. `canEdit`: admin-level only (change quantity / remove).
 * Everybody who can read the nalog sees the list; no prices.
 */
export function NalogMaterial({ nalogId, assigneeId, isAdmin, canAdd, canEdit }:
  { nalogId: number; assigneeId: number | null; isAdmin: boolean; canAdd: boolean; canEdit: boolean }) {
  const { t, lang } = useLang();
  const locale = lang === 'sr' ? 'sr-Latn-RS' : 'en-GB';
  const [lines, setLines] = useState<MaterialLine[] | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<HeldPart[]>([]);
  const [picked, setPicked] = useState<HeldPart | null>(null);
  const [qty, setQty] = useState('1');
  const [editing, setEditing] = useState<{ lineId: number; qty: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const errText = (e: unknown) => (e instanceof NalogApiError ? e.message : t('nalogForm_unexpected'));

  const load = useCallback(async (signal?: AbortSignal) => {
    try { setLines(await nalogApi.listMaterial(nalogId, signal)); }
    catch (e) { if (e instanceof NalogApiError && e.message !== 'Request cancelled') setError(e.message); }
  }, [nalogId]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // Search only: nothing is listed until something is typed.
  useEffect(() => {
    if (!canAdd || !q.trim() || (isAdmin && !assigneeId)) { setResults([]); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      nalogApi.listHeldParts(isAdmin ? { technicianId: assigneeId ?? undefined, q: q.trim() } : { q: q.trim() }, ctrl.signal)
        .then((r) => setResults(r.slice(0, 15))).catch(() => {});
    }, 250);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [q, canAdd, isAdmin, assigneeId]);

  async function act(fn: () => Promise<MaterialLine[]>) {
    if (busy) return;
    setBusy(true); setError('');
    try { setLines(await fn()); return true; }
    catch (e) { setError(errText(e)); return false; }
    finally { setBusy(false); }
  }

  async function add() {
    if (!picked) return;
    if (!QTY_RE.test(qty.trim()) || Number(norm(qty)) <= 0) { setError(t('material_qtyInvalid')); return; }
    const ok = await act(() => nalogApi.addMaterial(nalogId, [{ partId: picked.partId, quantity: norm(qty) }]));
    if (ok) { setPicked(null); setQ(''); setQty('1'); setResults([]); }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>{t('material_title')}</div>

      {error && <div role="alert" style={{ background: '#FBEAE5', color: 'var(--danger)', padding: '8px 12px', borderRadius: 4, marginBottom: 10, fontSize: 13 }}>{error}</div>}

      {lines && lines.length === 0 && <div style={{ color: 'var(--stone)', fontSize: 13 }}>{t('material_empty')}</div>}
      {lines && lines.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <tbody>
            {lines.map((l) => (
              <tr key={l.lineId} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 0' }}>
                  <div style={{ fontWeight: 500 }}>{l.name}</div>
                  <div style={{ color: 'var(--stone)', fontSize: 12 }}>
                    {l.sku ? `${l.sku} · ` : ''}{t('material_razNo')} {l.docNo} · {fmt(l.at)} · {l.byName}
                  </div>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap', padding: '6px 0 6px 8px' }}>
                  {canEdit && editing?.lineId === l.lineId ? (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <input className="input" style={{ width: 90 }} inputMode="decimal" value={editing.qty}
                             onChange={(e) => setEditing({ lineId: l.lineId, qty: e.target.value })} />
                      <button className="btn btn-sm" disabled={busy} onClick={async () => {
                        if (!QTY_RE.test(editing.qty.trim()) || Number(norm(editing.qty)) <= 0) { setError(t('material_qtyInvalid')); return; }
                        if (await act(() => nalogApi.changeMaterial(nalogId, l.lineId, norm(editing.qty)))) setEditing(null);
                      }}>{t('material_save')}</button>
                      <button className="btn-secondary btn-sm" onClick={() => setEditing(null)}>{t('common_cancel')}</button>
                    </span>
                  ) : (
                    <>
                      <span>{l.quantity} {l.unit}</span>
                      {canEdit && (
                        <span style={{ marginLeft: 10, display: 'inline-flex', gap: 6 }}>
                          <button className="btn-secondary btn-sm" disabled={busy} onClick={() => setEditing({ lineId: l.lineId, qty: l.quantity })}>{t('nalogDetail_edit')}</button>
                          <button className="btn-danger-outline btn-sm" disabled={busy}
                                  onClick={() => { if (window.confirm(t('material_removeConfirm'))) act(() => nalogApi.removeMaterial(nalogId, l.lineId)); }}>{t('material_remove')}</button>
                        </span>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canAdd && (
        <div style={{ marginTop: 14 }}>
          {isAdmin && !assigneeId ? (
            <div style={{ color: 'var(--stone)', fontSize: 13 }}>{t('material_unassigned')}</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder={t('material_search')} value={picked ? `${picked.sku ? picked.sku + ' · ' : ''}${picked.name}` : q}
                       onChange={(e) => { setPicked(null); setQ(e.target.value); }} />
                <input className="input" style={{ width: 90 }} inputMode="decimal" aria-label={t('material_qty')} value={qty} onChange={(e) => setQty(e.target.value)} />
                <button className="btn btn-sm" disabled={busy || !picked} onClick={add}>{t('material_add')}</button>
              </div>
              {!picked && q.trim() && results.length === 0 && <div style={{ color: 'var(--stone)', fontSize: 12.5, marginTop: 6 }}>{t('material_noParts')}</div>}
              {!picked && results.length > 0 && (
                <div className="card" style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {results.map((r) => (
                    <button key={r.partId} className="btn-secondary" style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, borderRadius: 0 }}
                            onClick={() => { setPicked(r); setResults([]); }}>
                      {r.sku ? `${r.sku} · ` : ''}{r.name} <span style={{ color: 'var(--stone)' }}>({r.unit})</span>
                    </button>
                  ))}
                </div>
              )}
              <div style={{ color: 'var(--stone)', fontSize: 12, marginTop: 6 }}>{t('material_hint')}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
