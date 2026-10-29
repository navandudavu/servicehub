import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LangContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const { t, lang, setLang } = useLang();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--paper)', position: 'relative'
    }}>
      <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', gap: 6 }}>
        <button
          onClick={() => setLang('en')}
          className={lang === 'en' ? 'btn' : 'btn-secondary'}
          style={{ padding: '5px 10px', fontSize: 12 }}
        >
          EN
        </button>
        <button
          onClick={() => setLang('sr')}
          className={lang === 'sr' ? 'btn' : 'btn-secondary'}
          style={{ padding: '5px 10px', fontSize: 12 }}
        >
          SR
        </button>
      </div>

      <div className="card" style={{ width: 360, padding: 32 }}>
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/elgor-logo.png" alt="ELGOR" style={{ width: 44, height: 44, borderRadius: '50%' }} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>ELGOR</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--stone)' }}>
              {t('appName').toUpperCase()}
            </div>
          </div>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 20px' }}>{t('login_title')}</h1>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">{t('login_email')}</label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">{t('login_password')}</label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div style={{
              background: '#FBEAE5', color: 'var(--danger)', fontSize: 13,
              padding: '8px 10px', borderRadius: 4, marginBottom: 14
            }}>
              {error}
            </div>
          )}

          <button className="btn" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? t('login_button_busy') : t('login_button')}
          </button>
        </form>
      </div>
    </div>
  );
}
