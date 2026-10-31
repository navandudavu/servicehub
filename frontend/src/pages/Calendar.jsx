import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { nalogApi } from '../api/nalog';
import { useLang } from '../i18n/LangContext';
import { NalogStatusTag } from '../components/NalogStatusTag';

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

// LOCAL calendar date (not toISOString, which is UTC and would shift evening visits to the wrong day)
function toDateKey(date) {
  const p2 = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p2(date.getMonth() + 1)}-${p2(date.getDate())}`;
}

// Planned visits come from the nalog service (GET /api/nalozi/calendar). Admins see everyone's,
// technicians only their own - the server decides, not this page.
export default function Calendar() {
  const { t, lang, dayLabels } = useLang();
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (signal) => {
    setLoading(true);
    try {
      const from = weekStart.toISOString();
      const to = addDays(weekStart, 7).toISOString();
      setEntries(await nalogApi.getCalendar(from, to, signal));
      setError('');
    } catch (err) {
      if (err.message !== 'Request cancelled') setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDay = {};
  days.forEach((d) => { byDay[toDateKey(d)] = []; });
  entries.forEach((e) => {
    const key = toDateKey(new Date(e.scheduledAt));
    if (byDay[key]) byDay[key].push(e);
  });

  const localeTag = lang === 'sr' ? 'sr-Latn-RS' : undefined;
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
          <button className="btn-secondary btn-sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>{t('calendar_prev')}</button>
          <button className="btn-secondary btn-sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>{t('calendar_today')}</button>
          <button className="btn-secondary btn-sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>{t('calendar_next')}</button>
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
          return (
            <div key={key} className="card" style={{ padding: 10, minHeight: 220, borderColor: isToday ? 'var(--green)' : undefined }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: isToday ? 'var(--green-dark)' : 'var(--stone)', marginBottom: 8 }}>
                {dayLabels[i]} {day.getDate()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(byDay[key] || []).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => navigate(`/nalozi/${e.id}`)}
                    className="card"
                    style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11.5, cursor: 'pointer', width: '100%' }}
                  >
                    <div style={{ fontWeight: 500 }}>
                      {new Date(e.scheduledAt).toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ color: 'var(--stone)', fontFamily: 'var(--mono)' }}>{e.nalogNumber}</div>
                    <div>{e.customerName}</div>
                    {e.assignedToName && <div style={{ color: 'var(--stone)' }}>{e.assignedToName}</div>}
                    <div style={{ marginTop: 3 }}><NalogStatusTag status={e.status} /></div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {entries.length === 0 && !loading && (
        <div style={{ fontSize: 13, color: 'var(--stone)', marginTop: 16 }}>{t('calendar_noJobs')}</div>
      )}
    </div>
  );
}
