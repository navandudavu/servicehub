import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { nalogApi } from '../api/nalog';
import Spinner from '../components/Spinner';
import { useCurrentUser } from '../context/typedAuth';
import { isAdminLevel } from '../context/roles';
import { useLang } from '../i18n/typedLang';
import { COMPANY } from '../print/company';
import type { CarriedView } from '../types/nalog';

const CSS = `
.carried-print { max-width: 182mm; margin: 0 auto; font-size: 12px; color: #000; }
.carried-print h1 { font-size: 18px; margin: 0 0 2px; }
.carried-print .muted { color: #555; }
.carried-print table { width: 100%; border-collapse: collapse; margin: 14px 0; }
.carried-print th, .carried-print td { border: 1px solid #999; padding: 5px 8px; text-align: left; }
.carried-print .num { text-align: right; }
.carried-print .sign { display: flex; justify-content: space-between; margin-top: 60px; }
.carried-print .sign div { width: 45%; border-top: 1px solid #000; padding-top: 4px; text-align: center; }
@media print { .no-print { display: none !important; } }
`;

/** Standalone page (no sidebar): the zaduzenje of one technician as a printable document. */
export default function CarriedPrintPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const [search] = useSearchParams();
  const asked = search.get('technicianId');
  const technicianId = isAdminLevel(user?.role) && asked ? Number(asked) : undefined;

  const [items, setItems] = useState<CarriedView[] | null>(null);
  const [techName, setTechName] = useState(isAdminLevel(user?.role) ? '' : (user?.name ?? ''));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    nalogApi.listCarried(technicianId, ctrl.signal).then(setItems).catch(() => { if (!ctrl.signal.aborted) setFailed(true); });
    if (technicianId != null) {
      nalogApi.listTechnicians(ctrl.signal)
        .then((list) => setTechName(list.find((x) => x.id === technicianId)?.name ?? ''))
        .catch(() => {});
    }
    return () => ctrl.abort();
  }, [technicianId]);

  const today = new Date().toLocaleDateString('sr-RS');

  return (
    <div style={{ background: '#fff', minHeight: '100vh', padding: 24 }}>
      <div className="no-print" style={{ display: 'flex', gap: 8, maxWidth: '182mm', margin: '0 auto 20px' }}>
        <button className="btn-secondary" onClick={() => navigate('/carried')}>{t('nalogPrint_back')}</button>
        <button className="btn" disabled={!items} onClick={() => window.print()}>{t('nalogPrint_print')}</button>
      </div>
      {failed && <p>{t('nalogForm_unexpected')}</p>}
      {!items && !failed && <Spinner label={t('jobBoard_loading')} />}
      {items && (
        <div className="carried-print">
          <style>{CSS}</style>
          <h1>{COMPANY.name}</h1>
          <div className="muted">{COMPANY.address} · {COMPANY.phone} · {COMPANY.email}</div>
          <h1 style={{ marginTop: 18 }}>{t('carried_printTitle')}</h1>
          <div>{t('carried_technician')}: <strong>{techName}</strong> · {t('carried_printDate')}: {today}</div>
          <table>
            <thead>
              <tr><th>#</th><th>{t('carried_sku')}</th><th>{t('carried_name')}</th><th className="num">{t('carried_quantity')}</th></tr>
            </thead>
            <tbody>
              {items.map((c, i) => (
                <tr key={c.id}><td>{i + 1}</td><td>{c.sku ?? ''}</td><td>{c.name}</td><td className="num">{c.quantity}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="sign"><div>{t('carried_signTech')}</div><div>{t('carried_signIssuer')}</div></div>
        </div>
      )}
    </div>
  );
}
