import { useEffect, useState } from 'react';
import { nalogApi } from '../api/nalog';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LangContext';
import Spinner from '../components/Spinner';

const STATUS_ORDER = ['DRAFT', 'DISPATCHED', 'IN_PROGRESS', 'AWAITING_PARTS', 'COMPLETED', 'CANCELLED'];

// Numbers come from the nalog service (GET /api/nalozi/stats); this page does no maths except bar widths.
export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    nalogApi.getStats(ctrl.signal)
      .then(setStats)
      .catch((err) => { if (err.message !== 'Request cancelled') setError(err.message); });
    return () => ctrl.abort();
  }, []);

  if (error) {
    return <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>;
  }
  if (!stats) {
    return <div style={{ padding: '20px 0' }}><Spinner label={t('jobBoard_loading')} /></div>;
  }

  const statusMap = Object.fromEntries(stats.byStatus.map((s) => [s.status, s.count]));
  const maxStatus = Math.max(...STATUS_ORDER.map((s) => statusMap[s] || 0), 1);
  const perTech = stats.openByTechnician || [];
  const hoursByTech = stats.hoursByTechnician || [];
  const hasAnyHours = hoursByTech.some((tech) => Number(tech.totalHours) > 0);
  const isAdmin = user.role === 'admin';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{t('dashboard_title')}</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        <StatCard label={t('dashboard_openJobs')} value={stats.open} />
        <StatCard label={t('dashboard_unassigned')} value={stats.unassigned} accent={stats.unassigned > 0 ? 'var(--orange)' : undefined} />
        <StatCard label={t('dashboard_awaitingParts')} value={stats.awaitingParts} accent={stats.awaitingParts > 0 ? 'var(--orange)' : undefined} />
        <StatCard label={t('dashboard_finishedWeek')} value={stats.completedThisWeek} accent="var(--green)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: 20, marginBottom: 20 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--stone)', marginBottom: 14 }}>{t('dashboard_byStatus')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {STATUS_ORDER.map((status) => {
              const count = statusMap[status] || 0;
              return (
                <div key={status}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                    <span>{t(`nalogStatus_${status}`)}</span>
                    <span style={{ color: 'var(--stone)' }}>{count}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--paper)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${(count / maxStatus) * 100}%`,
                      background: status === 'COMPLETED' ? 'var(--green)' : status === 'CANCELLED' ? 'var(--stone-light)' : 'var(--ink)',
                      borderRadius: 3
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {isAdmin && (
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--stone)', marginBottom: 14 }}>{t('dashboard_byTech')}</div>
            {perTech.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--stone)' }}>{t('dashboard_noTechs')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {perTech.map((tech) => {
                  const max = Math.max(...perTech.map((x) => x.count), 1);
                  return (
                    <div key={tech.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                        <span>{tech.name === '-' ? t('nalogForm_unassigned') : tech.name}</span>
                        <span style={{ color: 'var(--stone)' }}>{tech.count}</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--paper)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(tech.count / max) * 100}%`, background: 'var(--green)', borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {isAdmin && hoursByTech.length > 0 && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--stone)', marginBottom: 14 }}>{t('dashboard_hoursByTech')}</div>
          {!hasAnyHours ? (
            <div style={{ fontSize: 13, color: 'var(--stone)' }}>{t('dashboard_noTechs')}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
              {hoursByTech.map((tech) => (
                <div key={tech.name} className="card" style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>{tech.name === '-' ? t('nalogForm_unassigned') : tech.name}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, fontFamily: 'var(--mono)' }}>
                    {t('dashboard_hoursTotal', tech.totalHours)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--stone)', marginTop: 2 }}>
                    {t('dashboard_hoursThisWeek', tech.hoursThisWeek)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div style={{ fontSize: 26, fontWeight: 600, color: accent || 'var(--ink)', fontFamily: 'var(--mono)' }}>{value}</div>
      <div style={{ fontSize: 12.5, color: 'var(--stone)', marginTop: 2 }}>{label}</div>
    </div>
  );
}
