import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { nalogApi } from '../api/nalog';
import { NalogApiError } from '../api/nalogApi';
import { NalogForm } from '../components/NalogForm';
import Spinner from '../components/Spinner';
import { useCurrentUser } from '../context/typedAuth';
import { useLang } from '../i18n/typedLang';
import { EDITABLE_STATUSES, type NalogResponse } from '../types/nalog';

/** Same form as "new work order", filled from the saved nalog. Finished (and cancelled) ones cannot be edited. */
export default function NalogEdit() {
  const { id } = useParams();
  const nalogId = Number(id);
  const { t } = useLang();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [nalog, setNalog] = useState<NalogResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    nalogApi.getNalog(nalogId, ctrl.signal)
      .then(setNalog)
      .catch((e) => {
        if (e instanceof NalogApiError && e.message !== 'Request cancelled') setError(e.message);
      });
    return () => ctrl.abort();
  }, [nalogId]);

  if (error) {
    return <div><Link to="/nalozi">{t('nalogDetail_back')}</Link><p style={{ marginTop: 16 }}>{error}</p></div>;
  }
  if (!nalog) return <div style={{ padding: 20 }}><Spinner label={t('jobBoard_loading')} /></div>;
  if (!EDITABLE_STATUSES.includes(nalog.status)) {
    return (
      <div>
        <Link to={`/nalozi/${nalog.id}`}>{t('nalogDetail_back')}</Link>
        <p style={{ marginTop: 16 }}>{t('nalogEdit_notEditable')}</p>
      </div>
    );
  }

  return (
    <div>
      <Link to={`/nalozi/${nalog.id}`} style={{ fontSize: 13 }}>{t('nalogDetail_back')}</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '10px 0 20px' }}>
        {t('nalogEdit_title')} <span style={{ fontFamily: 'var(--mono)' }}>{nalog.nalogNumber}</span>
      </h1>
      <NalogForm isAdmin={user?.role === 'admin'} editing={nalog} onSaved={(n) => navigate(`/nalozi/${n.id}`)} />
    </div>
  );
}
