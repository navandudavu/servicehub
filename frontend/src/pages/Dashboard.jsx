import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LangContext';
import Spinner from '../components/Spinner';

const STATUS_ORDER = ['pending', 'assigned', 'in_progress', 'finished', 'cancelled'];

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    api.jobs.stats().then(setStats).catch((err) => setError(err.message));
  }, []);

  async function handleExport() {
    setExporting(true);
    setExportError('');
    try {
      await api.jobs.exportCsv();
    } catch (err) {
      setExportError(err.message || t('dashboard_exportFailed'));
    } finally {
      setExporting(false);
    }
  }

  if (error) {
    return <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>;
  }
  if (!stats) {
    return <div style={{ padding: '20px 0' }}><Spinner label={t('jobBoard_loading')} /></div>;
  }

  const statusMap = Object.fromEntries(stats.byStatus.map((s) => [s.status, s.count]));
  const totalOpen = (statusMap.pending || 0) + (statusMap.assigned || 0) + (statusMap.in_progress || 0);
  const hoursByTech = stats.hoursByTechnician || [];
  const hasAnyHours = hoursByTech.some((tech) => tech.totalHours > 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{t('dashboard_title')}</h1>
        {user.role === 'admin' && (
          <div style={{ textAlign: 'right' }}>
            <button className="btn-secondary btn-sm" onClick={handleExport} disabled={exporting}>
              {exporting ? t('dashboard_exporting') : t('dashboard_exportCsv')}
            </button>
            {exportError && <div style={{ color: 'var(--danger)', fontSize: 11.5, marginTop: 4 }}>{exportError}</div>}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        <StatCard label={t('dashboard_openJobs')} value={totalOpen} />
        <StatCard label={t('dashboard_unassigned')} value={stats.unassigned} accent={stats.unassigned > 0 ? 'var(--orange)' : undefined} />
        <StatCard label={t('dashboard_urgentOpen')} value={stats.urgentOpen} accent={stats.urgentOpen > 0 ? 'var(--danger)' : undefined} />
        <StatCard label={t('dashboard_finishedWeek')} value={stats.finishedThisWeek} accent="var(--green)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: user.role === 'admin' ? '1fr 1fr' : '1fr', gap: 20, marginBottom: 20 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--stone)', marginBottom: 14 }}>{t('dashboard_byStatus')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {STATUS_ORDER.map((status) => {
              const count = statusMap[status] || 0;
              const max = Math.max(...STATUS_ORDER.map((s) => statusMap[s] || 0), 1);
              return (
                <div key={status}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                    <span>{t(`status_${status}`)}</span>
                    <span style={{ color: 'var(--stone)' }}>{count}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--paper)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${(count / max) * 100}%`,
                      background: status === 'finished' ? 'var(--green)' : status === 'cancelled' ? 'var(--stone-light)' : 'var(--ink)',
                      borderRadius: 3
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {user.role === 'admin' && (
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--stone)', marginBottom: 14 }}>{t('dashboard_byTech')}</div>
            {stats.byTechnician.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--stone)' }}>{t('dashboard_noTechs')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stats.byTechnician.map((tech) => {
                  const max = Math.max(...stats.byTechnician.map((x) => x.count), 1);
                  return (
                    <div key={tech.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                        <span>{tech.name}</span>
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

      {user.role === 'admin' && hoursByTech.length > 0 && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--stone)', marginBottom: 14 }}>{t('dashboard_hoursByTech')}</div>
          {!hasAnyHours ? (
            <div style={{ fontSize: 13, color: 'var(--stone)' }}>{t('dashboard_noTechs')}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
              {hoursByTech.map((tech) => (
                <div key={tech.name} className="card" style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>{tech.name}</div>
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
