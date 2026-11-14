import { useCallback, useEffect, useRef, useState } from 'react';
import { nalogApi } from '../api/nalog';
import { NalogApiError } from '../api/nalogApi';
import ConfirmDialog from './ConfirmDialog';
import { useLang } from '../i18n/typedLang';
import { usePolling } from '../hooks/usePolling';
import type { NoteView } from '../types/nalog';

const MAX_LEN = 2000;

/** Append-only notes for one nalog. Anyone who can open the nalog can read and add; only an admin can delete. `locked` (finished nalog) makes them read-only. */
export function NalogNotes({ nalogId, isAdmin, locked = false }: { nalogId: number; isAdmin: boolean; locked?: boolean }) {
  const { t, lang } = useLang();
  const locale = lang === 'sr' ? 'sr-Latn-RS' : 'en-GB';
  const [notes, setNotes] = useState<NoteView[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<NoteView | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setNotes(await nalogApi.listNotes(nalogId, signal));
    } catch (e) {
      if (e instanceof NalogApiError && e.message !== 'Request cancelled') setError(e.message);
    }
  }, [nalogId]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // Background refresh: notes written on the phone appear without F5. Same guards as the photo list.
  const epoch = useRef(0);
  usePolling(async () => {
    if (busy) return;
    const seen = epoch.current;
    const next = await nalogApi.listNotes(nalogId);
    if (seen !== epoch.current) return;
    setNotes((prev) => (prev && prev.length === next.length && prev.every((n, i) => n.id === next[i].id) ? prev : next));
  }, 10000);

  async function add() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError('');
    try {
      const created = await nalogApi.addNote(nalogId, { body });
      setNotes((prev) => [...(prev ?? []), created]);
      epoch.current++;
      setText('');
    } catch (e) {
      setError(e instanceof NalogApiError ? e.message : t('nalogForm_unexpected'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleteTarget || busy) return;
    setBusy(true); setError('');
    try {
      await nalogApi.deleteNote(nalogId, deleteTarget.id);
      setNotes((prev) => (prev ?? []).filter((n) => n.id !== deleteTarget.id));
      epoch.current++;
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof NalogApiError ? e.message : t('nalogForm_unexpected'));
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
        {t('notes_title')}{notes && notes.length > 0 ? ` (${notes.length})` : ''}
      </div>

      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {notes && notes.length === 0 && <div style={{ color: 'var(--stone)', fontSize: 13, marginBottom: 10 }}>{t('notes_empty')}</div>}
      {notes && notes.map((n, i) => (
        <div key={n.id} style={{ padding: '8px 0', borderBottom: i < notes.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--stone)' }}>
            <span>{n.authorName} · {new Date(n.createdAt).toLocaleString(locale)}</span>
            {isAdmin && !locked && (
              <button className="btn-danger-outline btn-xs" onClick={() => setDeleteTarget(n)}>{t('notes_delete')}</button>
            )}
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, marginTop: 3, overflowWrap: 'anywhere' }}>{n.body}</div>
        </div>
      ))}

      {locked && <div style={{ color: 'var(--stone)', fontSize: 12.5, marginTop: 8 }}>{t('notes_locked')}</div>}
      {!locked && <div style={{ marginTop: 12 }}>
        <textarea className="input" rows={3} maxLength={MAX_LEN} value={text} placeholder={t('notes_placeholder')}
                  onChange={(e) => setText(e.target.value)} style={{ resize: 'vertical' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 }}>
          <span style={{ fontSize: 11.5, color: 'var(--stone)' }}>{t('notes_hint')}</span>
          <button className="btn btn-sm" disabled={busy || !text.trim()} onClick={add}>
            {busy ? t('notes_adding') : t('notes_add')}
          </button>
        </div>
      </div>}

      {deleteTarget && (
        <ConfirmDialog message={t('notes_deleteConfirm')} busy={busy} onConfirm={remove} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
