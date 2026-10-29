import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LangContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Spinner from '../components/Spinner';

export default function Team() {
  const { t } = useLang();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      setUsers(await api.users.list());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(user) {
    await api.users.setActive(user.id, !user.active);
    load();
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError('');
    try {
      await api.users.delete(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err.message);
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>{t('team_title')}</h1>
          <div style={{ fontSize: 13, color: 'var(--stone)' }}>{t('team_people', users.length)}</div>
        </div>
        <button className="btn" onClick={() => setShowNew(true)}>{t('team_add')}</button>
      </div>

      {error && (
        <div style={{ background: '#FBEAE5', color: 'var(--danger)', padding: '10px 14px', borderRadius: 4, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '20px 0' }}><Spinner label={t('jobBoard_loading')} /></div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <Th>{t('team_name')}</Th><Th>{t('team_email')}</Th><Th>{t('team_role')}</Th><Th>{t('team_status')}</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <Td><strong>{u.name}</strong></Td>
                  <Td>{u.email}</Td>
                  <Td style={{ textTransform: 'capitalize' }}>{u.role === 'admin' ? t('team_admin') : t('team_technician')}</Td>
                  <Td>
                    <span className="tag" style={{ color: u.active ? 'var(--green-dark)' : 'var(--danger)' }}>
                      {u.active ? t('team_active') : t('team_inactive')}
                    </span>
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-secondary btn-xs" onClick={() => setEditTarget(u)}>
                        {t('team_edit')}
                      </button>
                      <button className="btn-secondary btn-xs" onClick={() => setResetTarget(u)}>
                        {t('team_resetPassword')}
                      </button>
                      <button className="btn-secondary btn-xs" onClick={() => toggleActive(u)}>
                        {u.active ? t('team_deactivate') : t('team_reactivate')}
                      </button>
                      {u.id !== currentUser?.id && (
                        <button
                          className="btn-danger-outline btn-xs"
                          onClick={() => setDeleteTarget(u)}
                        >
                          {t('team_delete')}
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewUserModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
      {editTarget && <EditUserModal user={editTarget} onClose={() => setEditTarget(null)} onUpdated={() => { setEditTarget(null); load(); }} />}
      {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />}
      {deleteTarget && (
        <ConfirmDialog
          message={t('team_deleteConfirm', deleteTarget.name)}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
          busy={deleteBusy}
        />
      )}
    </div>
  );
}

function Th({ children }) {
  return <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11.5, fontWeight: 600, color: 'var(--stone)' }}>{children}</th>;
}
function Td({ children, ...props }) {
  return <td style={{ padding: '10px 14px' }} {...props}>{children}</td>;
}

function ResetPasswordModal({ user, onClose }) {
  const { t } = useLang();
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPassword.length < 4) return setError(t('changePwModal_minLength'));
    setBusy(true);
    setError('');
    try {
      await api.users.resetPassword(user.id, newPassword);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('team_resetPwTitle', user.name)} onClose={onClose}>
      {done ? (
        <div>
          <div style={{ fontSize: 13.5, marginBottom: 16 }}>
            {t('team_resetPwDone')} <strong>{user.name}</strong> {t('team_resetPwDoneSuffix')}
          </div>
          <div className="card" style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 13, marginBottom: 16 }}>
            {newPassword}
          </div>
          <button className="btn" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>{t('team_doneBtn')}</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>{t('team_newTempPassword')}</label>
            <input className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoFocus />
          </div>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ padding: '8px 16px' }}>{t('common_cancel')}</button>
            <button type="submit" className="btn" disabled={busy}>{busy ? t('changePwModal_saving') : t('team_resetPassword')}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function NewUserModal({ onClose, onCreated }) {
  const { t } = useLang();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('technician');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.users.create({ name, email, password, role, phone: phone || undefined });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('team_addPerson')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>{t('team_name')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>{t('team_email')}</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>{t('team_tempPassword')}</label>
          <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="field">
          <label>{t('team_phone')}</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('team_role')}</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="technician">{t('team_technician')}</option>
            <option value="admin">{t('team_admin')}</option>
          </select>
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn-secondary" onClick={onClose} style={{ padding: '8px 16px' }}>{t('common_cancel')}</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? t('customers_saving') : t('team_addPerson')}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({ user, onClose, onUpdated }) {
  const { t } = useLang();
  const { user: currentUser } = useAuth();
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email || '');
  const [role, setRole] = useState(user.role || 'technician');
  const [phone, setPhone] = useState(user.phone || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError(t('customers_nameRequired'));
    setBusy(true);
    setError('');
    try {
      await api.users.update(user.id, {
        name: name.trim(),
        email: email.trim(),
        role: currentUser?.role === 'admin' ? role : undefined,
        phone: phone.trim() || undefined
      });
      onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('team_editTitle', user.name)} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>{t('team_name')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>{t('team_email')}</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>{t('team_phone')}</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        {currentUser?.role === 'admin' && (
          <div className="field">
            <label>{t('team_role')}</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="technician">{t('team_technician')}</option>
              <option value="admin">{t('team_admin')}</option>
            </select>
          </div>
        )}
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn-secondary" onClick={onClose} style={{ padding: '8px 16px' }}>{t('common_cancel')}</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? t('customers_saving') : t('team_saveChanges')}</button>
        </div>
      </form>
    </Modal>
  );
}
