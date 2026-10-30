import { useCallback, useEffect, useRef, useState } from 'react';
import { nalogApi } from '../api/nalog';
import { NalogApiError } from '../api/nalogApi';
import Modal from './Modal';
import { useLang } from '../i18n/typedLang';
import type { PhotoCategory, PhotoView } from '../types/nalog';

const MAX_BYTES = 10 * 1024 * 1024;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** One thumbnail. Bytes are fetched with the auth header and shown through an object URL. */
function Thumb({ nalogId, photo, onClick }: { nalogId: number; photo: PhotoView; onClick: () => void }) {
  const { t } = useLang();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    nalogApi.fetchPhotoBlob(nalogId, photo.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [nalogId, photo.id]);

  const box = { width: '100%', aspectRatio: '1', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--paper)' } as const;
  if (failed) return <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--stone)', fontSize: 11 }}>{t('jobPhoto_failedToLoad')}</div>;
  if (!url) return <div style={box} />;
  return <img src={url} alt={photo.caption ?? t('nalogPhotos_title')} onClick={onClick} style={{ ...box, objectFit: 'cover', cursor: 'pointer' }} />;
}

export function NalogPhotos(props: {
  nalogId: number;
  canUpload: boolean;
  isAdmin: boolean;
  userId: number | null;
}) {
  const { nalogId, canUpload, isAdmin, userId } = props;
  const { t } = useLang();
  const [photos, setPhotos] = useState<PhotoView[]>([]);
  const [category, setCategory] = useState<PhotoCategory>('other');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<PhotoView | null>(null);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PhotoView | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setPhotos(await nalogApi.listPhotos(nalogId)); setError(''); }
    catch (e) { if (e instanceof NalogApiError) setError(e.message); }
  }, [nalogId]);

  useEffect(() => { load(); }, [load]);

  // full-size view
  useEffect(() => {
    if (!open) { setOpenUrl(null); return; }
    let objectUrl: string | null = null;
    let cancelled = false;
    nalogApi.fetchPhotoBlob(nalogId, open.id).then((b) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(b);
      setOpenUrl(objectUrl);
    }).catch(() => { /* viewer just stays empty */ });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [open, nalogId]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';                                   // allow choosing the same file again
    if (!file || uploading) return;
    if (file.size > MAX_BYTES) { setError(t('nalogPhotos_tooLarge')); return; }
    if (!OK_TYPES.includes(file.type)) { setError(t('nalogPhotos_badType')); return; }
    setUploading(true); setError('');
    try {
      const created = await nalogApi.uploadPhoto(nalogId, file, category);
      setPhotos((p) => [...p, created]);
    } catch (err) {
      if (err instanceof NalogApiError) setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await nalogApi.deletePhoto(nalogId, target.id);
      setPhotos((p) => p.filter((x) => x.id !== target.id));
      setOpen((o) => (o?.id === target.id ? null : o));
    } catch (err) {
      if (err instanceof NalogApiError) setError(err.message);
    }
  }

  const mayDelete = (p: PhotoView) => isAdmin || (userId !== null && p.uploadedById === userId);

  return (
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {t('nalogPhotos_title')} ({photos.length})
        </div>
        {canUpload && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select className="input" style={{ height: 28, padding: '0 6px', fontSize: 12 }} value={category}
                    onChange={(e) => setCategory(e.target.value as PhotoCategory)} disabled={uploading}>
              {(['before', 'after', 'label', 'other'] as PhotoCategory[]).map((c) => (
                <option key={c} value={c}>{t(`jobModal_photoCategory_${c}`)}</option>
              ))}
            </select>
            <button className="btn btn-sm" disabled={uploading} onClick={() => input.current?.click()}>
              {uploading ? t('jobModal_uploading') : t('jobModal_addPhoto')}
            </button>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={onFile} />
          </div>
        )}
      </div>

      {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{error}</div>}

      {photos.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--stone)' }}>{t('jobModal_noPhotos')}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {photos.map((p) => (
            <div key={p.id} style={{ position: 'relative' }}>
              <Thumb nalogId={nalogId} photo={p} onClick={() => setOpen(p)} />
              {p.category !== 'other' && (
                <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(255,255,255,0.9)', padding: '2px 5px',
                              borderRadius: 2, fontSize: 10, fontWeight: 600, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  {t(`jobModal_photoCategory_${p.category}`).toUpperCase()}
                </div>
              )}
              {mayDelete(p) && (
                <button onClick={() => setDeleteTarget(p)} aria-label="Delete"
                        style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(28,35,33,0.75)',
                                 color: '#fff', border: 'none', fontSize: 11, lineHeight: 1, cursor: 'pointer' }}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {open && (
        <Modal title={`${t(`jobModal_photoCategory_${open.category}`)}${open.uploadedByName ? ` · ${open.uploadedByName}` : ''}`} onClose={() => setOpen(null)} width={760}>
          {openUrl ? <img src={openUrl} alt="" style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: '0 auto' }} /> : <div style={{ color: 'var(--stone)' }}>…</div>}
        </Modal>
      )}

      {deleteTarget && (
        <Modal title={t('nalogPhotos_title')} onClose={() => setDeleteTarget(null)} width={400}>
          <p style={{ marginTop: 0 }}>{t('jobModal_deletePhotoConfirm')}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>{t('common_cancel')}</button>
            <button className="btn btn-danger" onClick={confirmDelete}>✕</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
