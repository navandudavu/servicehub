import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { nalogApi } from '../api/nalog';
import { useLang } from '../i18n/LangContext';
import { usePolling } from '../hooks/usePolling';
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

function startOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Planned visits come from the nalog service (GET /api/nalozi/calendar). Admins see everyone's,
// technicians only their own - the server decides, not this page.
// One screen shows the whole month (all 28-31 days): the grid is as tall as the window, every week is one row.
export default function Calendar() {
  const { t, lang, dayLabels } = useLang();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDay, setOpenDay] = useState(null); // 'YYYY-MM-DD' of the day whose nalozi are listed

  // Monday-first grid: from the Monday of the week containing the 1st to the Sunday of the week containing the last day.
  const gridStart = startOfWeek(month);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const weeks = Math.ceil((addDays(startOfWeek(lastDay), 7).getTime() - gridStart.getTime()) / (7 * 86400000));
  const gridEnd = addDays(gridStart, weeks * 7);

  const load = useCallback(async (signal) => {
    setLoading(true);
    try {
      setEntries(await nalogApi.getCalendar(gridStart.toISOString(), gridEnd.toISOString(), signal));
      setError('');
    } catch (err) {
      if (err.message !== 'Request cancelled') setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // Background refresh of the shown month (no dimming, no error banner), so a visit scheduled or changed
  // elsewhere appears without F5. A result is dropped if the month changed while it was in flight.
  const monthKeyRef = useRef(month.getTime());
  monthKeyRef.current = month.getTime();
  usePolling(async () => {
    if (loading) return;
    const key = month.getTime();
    const next = await nalogApi.getCalendar(gridStart.toISOString(), gridEnd.toISOString());
    if (key !== monthKeyRef.current) return;
    setEntries(next);
  }, 30000);

  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
  const byDay = {};
  days.forEach((d) => { byDay[toDateKey(d)] = []; });
  entries.forEach((e) => {
    const key = toDateKey(new Date(e.scheduledAt));
    if (byDay[key]) byDay[key].push(e);
  });

  const localeTag = lang === 'sr' ? 'sr-Latn-RS' : undefined;
  const monthLabel = month.toLocaleDateString(localeTag, { month: 'long', year: 'numeric' });
  const today = toDateKey(new Date());
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    // fills the whole screen: the page is as tall as the window (minus the 28px padding of <main>), the month grid takes what is left
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>{t('calendar_title')}</h1>
          <div style={{ fontSize: 14, color: 'var(--stone)', textTransform: 'capitalize' }}>{monthLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-secondary btn-sm" onClick={() => shift(-1)}>{t('calendar_prev')}</button>
          <button className="btn-secondary btn-sm" onClick={() => setMonth(startOfMonth(new Date()))}>{t('calendar_today')}</button>
          <button className="btn-secondary btn-sm" onClick={() => shift(1)}>{t('calendar_next')}</button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FBEAE5', color: 'var(--danger)', padding: '10px 14px', borderRadius: 4, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, marginBottom: 6 }}>
        {dayLabels.slice(0, 7).map((l) => (
          <div key={l} style={{ fontSize: 11, fontWeight: 600, color: 'var(--stone)', textAlign: 'center' }}>{l}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))`, gap: 6, flex: 1, minHeight: 0, opacity: loading ? 0.5 : 1 }}>
        {days.map((day) => {
          const key = toDateKey(day);
          const isToday = key === today;
          const outside = day.getMonth() !== month.getMonth();
          return (
            <div key={key} className="card" onClick={() => setOpenDay(key)} style={{ padding: 6, minHeight: 0, overflowY: 'auto', cursor: 'pointer', opacity: outside ? 0.45 : 1, borderColor: isToday ? 'var(--green)' : undefined }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: isToday ? 'var(--green-dark)' : 'var(--stone)', marginBottom: 4 }}>
                {day.getDate()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {(byDay[key] || []).map((e) => (
                  <button
                    key={e.id}
                    onClick={(ev) => { ev.stopPropagation(); navigate(`/nalozi/${e.id}`); }}
                    className="card"
                    title={`${e.nalogNumber} · ${e.customerName}${e.assignedToName ? ' · ' + e.assignedToName : ''}`}
                    style={{ textAlign: 'left', padding: '2px 5px', fontSize: 10.5, cursor: 'pointer', width: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
                  >
                    {e.customerName}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {openDay && (
        <div onClick={() => setOpenDay(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="card" onClick={(ev) => ev.stopPropagation()} style={{ width: 'min(560px, 92vw)', maxHeight: '80vh', overflowY: 'auto', padding: 20, background: 'var(--card-bg, #fff)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
                {new Date(`${openDay}T00:00:00`).toLocaleDateString(localeTag, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h2>
              <button className="btn-secondary btn-sm" onClick={() => setOpenDay(null)}>{t('calendar_close')}</button>
            </div>
            {(byDay[openDay] || []).length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--stone)' }}>{t('calendar_dayEmpty')}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(byDay[openDay] || []).map((e) => (
                <button key={e.id} className="card" onClick={() => navigate(`/nalozi/${e.id}`)}
                  style={{ textAlign: 'left', padding: '10px 12px', fontSize: 13, cursor: 'pointer', width: '100%' }}>
                  <div style={{ color: 'var(--stone)', fontFamily: 'var(--mono)' }}>{e.nalogNumber}</div>
                  <div style={{ fontWeight: 600 }}>{e.customerName}</div>
                  {e.assignedToName && <div style={{ color: 'var(--stone)' }}>{e.assignedToName}</div>}
                  <div style={{ marginTop: 4 }}><NalogStatusTag status={e.status} /></div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {entries.length === 0 && !loading && (
        <div style={{ fontSize: 13, color: 'var(--stone)', marginTop: 8 }}>{t('calendar_noJobs')}</div>
      )}
    </div>
  );
}
