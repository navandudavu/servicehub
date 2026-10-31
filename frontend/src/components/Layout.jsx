import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LangContext';
import { api } from '../api/client';
import Modal from './Modal';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t, lang, setLang } = useLang();
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const navItems = [
    { to: '/', label: t('nav_dashboard'), end: true },
    { to: '/nalozi', label: t('nav_nalozi') },
    { to: '/calendar', label: t('nav_calendar') },
    { to: '/customers', label: t('nav_customers') },
  ];
  const adminNavItems = [
    { to: '/reports', label: t('nav_reports') },
    { to: '/team', label: t('nav_team') },
  ];
  const items = user?.role === 'admin' ? [...navItems, ...adminNavItems] : navItems;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 220, borderRight: '1px solid var(--border)', background: 'var(--paper-raised)',
        display: 'flex', flexDirection: 'column', flexShrink: 0
      }}>
        <div style={{ padding: '18px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/elgor-logo.png" alt="ELGOR" style={{ width: 30, height: 30, borderRadius: '50%' }} />
            <div style={{ fontSize: 14, fontWeight: 700 }}>ELGOR</div>
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            <button
              onClick={() => setLang('en')}
              style={{
                background: 'none', border: 'none', padding: '2px 4px', fontSize: 11, cursor: 'pointer',
                color: lang === 'en' ? 'var(--ink)' : 'var(--stone)', fontWeight: lang === 'en' ? 600 : 400
              }}
            >
              EN
            </button>
            <span style={{ color: 'var(--border)' }}>/</span>
            <button
              onClick={() => setLang('sr')}
              style={{
                background: 'none', border: 'none', padding: '2px 4px', fontSize: 11, cursor: 'pointer',
                color: lang === 'sr' ? 'var(--ink)' : 'var(--stone)', fontWeight: lang === 'sr' ? 600 : 400
              }}
            >
              SR
            </button>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '0 10px' }}>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                display: 'block',
                padding: '9px 12px',
                borderRadius: 4,
                marginBottom: 2,
                fontSize: 13.5,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--on-accent)' : 'var(--ink)',
                background: isActive ? 'var(--green)' : 'transparent',
                textDecoration: 'none'
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setShowPasswordModal(true)}
            style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', width: '100%', cursor: 'pointer' }}
            title={t('changePassword')}
          >
            <div style={{ fontSize: 13, fontWeight: 500 }}>{user?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 10, textTransform: 'capitalize' }}>
              {user?.role === 'admin' ? t('team_admin') : t('team_technician')} · {t('changePassword')}
            </div>
          </button>
          <button className="btn-secondary" onClick={handleLogout} style={{
            width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 4,
            border: '1px solid var(--border)', background: 'transparent'
          }}>
            {t('signOut')}
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: '28px 36px', overflow: 'auto' }}>
        {children}
      </main>

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
    </div>
  );
}

function ChangePasswordModal({ onClose }) {
  const { t } = useLang();
  const [currentPassword, setCurrentPassword] = useState('');
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
      await api.users.changeMyPassword(currentPassword, newPassword);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('changePwModal_title')} onClose={onClose}>
      {done ? (
        <div>
          <div style={{ fontSize: 13.5, marginBottom: 16 }}>{t('changePwModal_done')}</div>
          <button className="btn" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>{t('changePwModal_doneBtn')}</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>{t('changePwModal_current')}</label>
            <input type="password" className="input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label>{t('changePwModal_new')}</label>
            <input type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </div>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ padding: '8px 16px' }}>{t('common_cancel')}</button>
            <button type="submit" className="btn" disabled={busy}>{busy ? t('changePwModal_saving') : t('changePwModal_save')}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
