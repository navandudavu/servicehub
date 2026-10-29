import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LangContext';
import Modal from './Modal';
import JobPhoto from './JobPhoto';
import ConfirmDialog from './ConfirmDialog';
import Spinner from './Spinner';

const STATUS_FLOW = ['pending', 'assigned', 'in_progress', 'finished'];

export default function JobModal({ jobId, onClose, onChanged }) {
  const { user } = useAuth();
  const { t } = useLang();
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [technicians, setTechnicians] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoCategory, setPhotoCategory] = useState('other');
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [deletePhotoTarget, setDeletePhotoTarget] = useState(null);
  const [showDeleteJobConfirm, setShowDeleteJobConfirm] = useState(false);
  const [deleteJobBusy, setDeleteJobBusy] = useState(false);

  async function handleDeleteJob() {
    setDeleteJobBusy(true);
    setError('');
    try {
      await api.jobs.delete(jobId);
      onChanged();
      onClose();
    } catch (err) {
      setError(err.message);
      setShowDeleteJobConfirm(false);
    } finally {
      setDeleteJobBusy(false);
    }
  }

  async function load() {
    try {
      const data = await api.jobs.get(jobId);
      setJob(data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    if (user?.role === 'admin') {
      api.users.list().then((users) => setTechnicians(users.filter((u) => u.role === 'technician' && u.active)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function handleStatusChange(status) {
    setBusy(true);
    setError('');
    try {
      await api.jobs.setStatus(jobId, status);
      await load();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign(technicianId) {
    setBusy(true);
    setError('');
    try {
      await api.jobs.assign(jobId, technicianId ? Number(technicianId) : null);
      await load();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSchedule(datetimeLocalValue) {
    setBusy(true);
    setError('');
    try {
      // datetime-local gives "2026-09-15T10:00", the backend expects an
      // ISO-ish string - append seconds so it stores/sorts consistently
      const value = datetimeLocalValue ? `${datetimeLocalValue}:00` : null;
      await api.jobs.setSchedule(jobId, value);
      await load();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleHoursBlur(value) {
    // Save on blur, not on every keystroke - typing "2.5" would otherwise
    // fire requests for "2", "2.", and "2.5", and a bare "2." mid-type
    // would briefly be an invalid number sent to the server.
    const trimmed = value.trim();
    const hours = trimmed === '' ? null : Number(trimmed);
    if (hours === job.hours_logged || (hours === null && job.hours_logged === null)) return;

    setBusy(true);
    setError('');
    try {
      await api.jobs.setHours(jobId, hours);
      await load();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.jobs.addNote(jobId, note);
      setNote('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePhotoSelected(e) {
    const file = e.target.files[0];
    e.target.value = ''; // allow selecting the same file again later
    if (!file) return;

    setUploadingPhoto(true);
    setError('');
    try {
      await api.jobs.uploadPhoto(jobId, file, photoCategory);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleDeletePhoto(photoId) {
    setBusy(true);
    setError('');
    try {
      await api.jobs.deletePhoto(jobId, photoId);
      setDeletePhotoTarget(null);
      await load();
    } catch (err) {
      setError(err.message);
      setDeletePhotoTarget(null);
    } finally {
      setBusy(false);
    }
  }

  if (!job) {
    return (
      <Modal title="" onClose={onClose}>
        <div style={{ padding: '10px 0' }}><Spinner label={t('jobBoard_loading')} /></div>
        {error && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</div>}
      </Modal>
    );
  }

  const canEditStatus = user.role === 'admin' || job.assigned_to === user.id;
  const currentIdx = STATUS_FLOW.indexOf(job.status);
  const nextStatus = job.status !== 'finished' && job.status !== 'cancelled'
    ? STATUS_FLOW[currentIdx + 1]
    : null;

  return (
    <Modal title={job.title} onClose={onClose} width={560}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <span className="tag">{t(`status_${job.status}`)}</span>
        <span className="tag" style={{ textTransform: 'capitalize' }}>{t('jobModal_priority', t(`priority_${job.priority}`))}</span>
        {job.appliance_type && (
          <span className="tag" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
            {job.appliance_type}
          </span>
        )}
      </div>

      {(job.appliance_brand || job.appliance_model || job.appliance_serial) && (
        <div style={{ background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 12px', marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--stone)', marginBottom: 4, textTransform: 'uppercase' }}>
            {t('jobModal_applianceDetails')}
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {job.appliance_brand && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--stone)' }}>{t('customers_brand')}</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{job.appliance_brand}</div>
              </div>
            )}
            {job.appliance_model && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--stone)' }}>{t('customers_model')}</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{job.appliance_model}</div>
              </div>
            )}
            {job.appliance_serial && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--stone)' }}>{t('jobModal_serialNumber')}</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{job.appliance_serial}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: '#FBEAE5', color: 'var(--danger)', padding: '8px 10px', borderRadius: 4, marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 18, fontSize: 13.5 }}>
        <div style={{ marginBottom: 6 }}>
          <strong>{t('jobModal_customer')}:</strong> {job.customer_name ? `${job.customer_name}${job.customer_phone ? ` · ${job.customer_phone}` : ''}` : t('jobModal_noCustomer')}
        </div>
        {job.address && <div style={{ marginBottom: 6 }}><strong>{t('jobModal_address')}:</strong> {job.address}</div>}
        {job.description && <div style={{ color: 'var(--stone)', marginTop: 8 }}>{job.description}</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {canEditStatus && nextStatus && (
          <button className="btn" disabled={busy} onClick={() => handleStatusChange(nextStatus)}>
            {t('jobModal_moveTo', t(`status_${nextStatus}`))}
          </button>
        )}
        {canEditStatus && job.status !== 'cancelled' && job.status !== 'finished' && (
          <button className="btn-secondary" disabled={busy} onClick={() => handleStatusChange('cancelled')}>
            {t('jobModal_cancelJob')}
          </button>
        )}
        {(user.role === 'admin' || job.created_by === user.id) && (
          <button className="btn-danger-outline" disabled={busy || deleteJobBusy} onClick={() => setShowDeleteJobConfirm(true)}>
            {t('jobModal_deleteJob')}
          </button>
        )}
      </div>

      {canEditStatus && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 18 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t('jobModal_hoursLogged')}</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                className="input"
                style={{ width: 70 }}
                value={Math.floor(job.hours_logged || 0)}
                onChange={(e) => {
                  const mins = ((job.hours_logged || 0) % 1) * 60;
                  handleHoursBlur((Number(e.target.value) + mins / 60).toString());
                }}
                disabled={busy}
              >
                {[...Array(25).keys()].map(h => <option key={h} value={h}>{h}{t('jobBoard_hoursSuffix')}</option>)}
              </select>
              <select
                className="input"
                style={{ width: 85 }}
                value={Math.round(((job.hours_logged || 0) % 1) * 60)}
                onChange={(e) => {
                  const hours = Math.floor(job.hours_logged || 0);
                  handleHoursBlur((hours + Number(e.target.value) / 60).toString());
                }}
                disabled={busy}
              >
                {[0, 15, 30, 45].map(m => <option key={m} value={m}>{m}m</option>)}
              </select>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 10 }}>
            ({job.hours_logged || 0}{t('jobBoard_hoursSuffix')})
          </div>
        </div>
      )}

      {user.role === 'admin' && (
        <div className="field">
          <label>{t('jobModal_assignedTech')}</label>
          <select
            className="input"
            value={job.assigned_to || ''}
            onChange={(e) => handleAssign(e.target.value)}
            disabled={busy}
          >
            <option value="">{t('jobModal_unassigned')}</option>
            {technicians.map((tech) => (
              <option key={tech.id} value={tech.id}>{tech.name}</option>
            ))}
          </select>
        </div>
      )}

      {user.role === 'admin' && (
        <div className="field">
          <label>{t('jobModal_scheduledFor')}</label>
          <input
            type="datetime-local"
            className="input"
            value={job.scheduled_at ? job.scheduled_at.slice(0, 16) : ''}
            onChange={(e) => handleSchedule(e.target.value)}
            disabled={busy}
          />
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--stone)', textTransform: 'uppercase' }}>{t('jobModal_photos')}</div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="input"
              style={{ padding: '4px 8px', fontSize: 12, width: 'auto', height: 28 }}
              value={photoCategory}
              onChange={(e) => setPhotoCategory(e.target.value)}
              disabled={uploadingPhoto}
            >
              <option value="before">{t('jobModal_photoCategory_before')}</option>
              <option value="after">{t('jobModal_photoCategory_after')}</option>
              <option value="label">{t('jobModal_photoCategory_label')}</option>
              <option value="other">{t('jobModal_photoCategory_other')}</option>
            </select>

            <label className="btn-secondary" style={{
              padding: '5px 12px', fontSize: 12, cursor: uploadingPhoto ? 'not-allowed' : 'pointer',
              opacity: uploadingPhoto ? 0.5 : 1, margin: 0, height: 28, display: 'flex', alignItems: 'center'
            }}>
              {uploadingPhoto ? t('jobModal_uploading') : t('jobModal_addPhoto')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                onChange={handlePhotoSelected}
                disabled={uploadingPhoto}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>

        {job.photos.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--stone)' }}>{t('jobModal_noPhotos')}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {job.photos.map((p) => (
              <div key={p.id} style={{ position: 'relative' }}>
                <JobPhoto
                  filename={p.filename}
                  onClick={() => setLightboxPhoto(p)}
                  style={{ width: '100%', aspectRatio: '1', borderRadius: 4, border: '1px solid var(--border)' }}
                />

                {p.category && p.category !== 'other' && (
                  <div style={{
                    position: 'absolute', bottom: 4, left: 4, background: 'rgba(255,255,255,0.9)',
                    padding: '2px 5px', borderRadius: 2, fontSize: 10, fontWeight: 600, color: 'var(--primary)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}>
                    {t(`jobModal_photoCategory_${p.category}`).toUpperCase()}
                  </div>
                )}

                {(user.role === 'admin' || p.uploaded_by === user.id) && (
                  <button
                    onClick={() => setDeletePhotoTarget(p.id)}
                    style={{
                      position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%',
                      background: 'rgba(28,35,33,0.75)', color: '#fff', border: 'none', fontSize: 11,
                      lineHeight: 1, cursor: 'pointer'
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {lightboxPhoto && (
        <div
          onClick={() => setLightboxPhoto(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30, cursor: 'zoom-out'
          }}
        >
          <JobPhoto filename={lightboxPhoto.filename} style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 4 }} />
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--stone)', marginBottom: 8 }}>{t('jobModal_notes')}</div>
        <form onSubmit={handleAddNote} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            className="input"
            placeholder={t('jobModal_addNotePlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="btn-secondary btn-sm" type="submit" disabled={busy || !note.trim()}>
            {t('jobModal_add')}
          </button>
        </form>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {job.notes.length === 0 && <div style={{ fontSize: 13, color: 'var(--stone)' }}>{t('jobModal_noNotes')}</div>}
          {job.notes.map((n) => (
            <div key={n.id} style={{ fontSize: 13, background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 4, padding: '8px 10px' }}>
              <div>{n.note}</div>
              <div style={{ fontSize: 11, color: 'var(--stone)', marginTop: 4 }}>
                {n.author_name} · {new Date(n.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {deletePhotoTarget && (
        <ConfirmDialog
          message={t('jobModal_deletePhotoConfirm')}
          onConfirm={() => handleDeletePhoto(deletePhotoTarget)}
          onCancel={() => setDeletePhotoTarget(null)}
          busy={busy}
        />
      )}
      {showDeleteJobConfirm && (
        <ConfirmDialog
          message={t('jobModal_deleteJobConfirm')}
          onConfirm={handleDeleteJob}
          onCancel={() => setShowDeleteJobConfirm(false)}
          busy={deleteJobBusy}
        />
      )}
    </Modal>
  );
}
