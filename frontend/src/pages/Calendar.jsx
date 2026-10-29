import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LangContext';
import JobModal from '../components/JobModal';

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // shift so week starts Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

export default function Calendar() {
  const { user } = useAuth();
  const { t, lang, dayLabels } = useLang();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [showAll, setShowAll] = useState(user?.role === 'admin');

  const weekEnd = addDays(weekStart, 6);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = toDateKey(weekStart);
      const to = toDateKey(addDays(weekEnd, 1)); // inclusive of the last day
      const data = await api.jobs.calendarRange(from, to, showAll);
      setJobs(data);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, showAll]);

  useEffect(() => { load(); }, [load]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const jobsByDay = {};
  days.forEach((d) => { jobsByDay[toDateKey(d)] = []; });
  jobs.forEach((j) => {
    const key = j.scheduled_at.slice(0, 10);
    if (jobsByDay[key]) jobsByDay[key].push(j);
  });

  const localeTag = lang === 'sr' ? 'sr-RS' : undefined;
  const monthLabel = weekStart.toLocaleDateString(localeTag, { month: 'long', year: 'numeric' });
  const today = toDateKey(new Date());

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>{t('calendar_title')}</h1>
          <div style={{ fontSize: 13, color: 'var(--stone)' }}>{monthLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {user?.role === 'admin' && (
            <button className="btn-secondary btn-sm" onClick={() => setShowAll(!showAll)}>
              {showAll ? t('calendar_showMine') : t('calendar_showAll')}
            </button>
          )}
          <button className="btn-secondary btn-sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            {t('calendar_prev')}
          </button>
          <button className="btn-secondary btn-sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            {t('calendar_today')}
          </button>
          <button className="btn-secondary btn-sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            {t('calendar_next')}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FBEAE5', color: 'var(--danger)', padding: '10px 14px', borderRadius: 4, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, opacity: loading ? 0.5 : 1 }}>
        {days.map((day, i) => {
          const key = toDateKey(day);
          const isToday = key === today;
          const dayJobs = jobsByDay[key] || [];
          return (
            <div key={key} className="card" style={{ padding: 10, minHeight: 220, borderColor: isToday ? 'var(--green)' : undefined }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: isToday ? 'var(--green-dark)' : 'var(--stone)', marginBottom: 8 }}>
                {dayLabels[i]} {day.getDate()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dayJobs.map((j) => (
                  <button
                    key={j.id}
                    onClick={() => setSelectedJob(j.id)}
                    className={`card priority-${j.priority}`}
                    style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11.5, cursor: 'pointer', width: '100%' }}
                  >
                    <div style={{ fontWeight: 500 }}>
                      {new Date(j.scheduled_at).toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ color: 'var(--stone)' }}>{j.title}</div>
                    <div style={{ color: 'var(--stone)' }}>{j.customer_name || t('jobBoard_noCustomer')}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {jobs.length === 0 && !loading && (
        <div style={{ fontSize: 13, color: 'var(--stone)', marginTop: 16 }}>
          {t('calendar_noJobs')}
        </div>
      )}

      {selectedJob && (
        <JobModal jobId={selectedJob} onClose={() => setSelectedJob(null)} onChanged={load} />
      )}
    </div>
  );
}
