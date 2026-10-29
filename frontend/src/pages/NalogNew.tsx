import { useNavigate } from 'react-router-dom';
import { NalogForm } from '../components/NalogForm';
import { useCurrentUser } from '../context/typedAuth';
import { useLang } from '../i18n/typedLang';

export default function NalogNew() {
  const { t } = useLang();
  const user = useCurrentUser();
  const navigate = useNavigate();

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>{t('nalogForm_title')}</h1>
      <NalogForm isAdmin={user?.role === 'admin'} onCreated={(n) => navigate(`/nalozi/${n.id}`)} />
    </div>
  );
}
