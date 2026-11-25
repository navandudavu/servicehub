import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nalogApi } from '../api/nalog';
import Spinner from '../components/Spinner';
import { useLang } from '../i18n/typedLang';
import type { StockDocView, TechnicianView } from '../types/nalog';

const todayStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Belgrade' });
const dayStart = (d: string) => new Date(`${d}T00:00:00`).toISOString();
const dayAfter = (d: string) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + 1); return x.toISOString(); };

/** Status Magacina: all Zaduzenja and Razduzenja of ONE day, for one technician or for all of them. Nothing else. */
export default function StockStatus() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [fromDay, setFromDay] = useState(todayStr());
  const [toDay, setToDay] = useState(todayStr());
  const [techId, setTechId] = useState('');
  const [technicians, setTechnicians] = useState<TechnicianView[]>([]);
  const [docs, setDocs] = useState<StockDocView[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    nalogApi.listTechnicians(ctrl.signal).then(setTechnicians).catch(() => {});
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (!fromDay || !toDay || fromDay > toDay) return;
    const ctrl = new AbortController();
    setDocs(null); setFailed(false);
    nalogApi.fullStockDocs({ ...(techId ? { technicianId: Number(techId) } : {}), from: dayStart(fromDay), to: dayAfter(toDay) }, ctrl.signal)
      .then(setDocs).catch(() => { if (!ctrl.signal.aborted) setFailed(true); });
    return () => ctrl.abort();
  }, [fromDay, toDay, techId]);

  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === 'sr' ? 'sr-Latn-RS' : 'en-GB', { timeZone: 'Europe/Belgrade', dateStyle: 'short', timeStyle: 'short' });
  const print = () => {
    const p = new URLSearchParams({ from: dayStart(fromDay), to: dayAfter(toDay), back: '/stock-status' });
    if (techId) p.set('technicianId', techId);
    navigate(`/stock-docs/print?${p.toString()}`);
  };

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <h1 style={{ marginBottom: 4 }}>{t('stockStatus_title')}</h1>
      <div style={{ color: 'var(--stone)', fontSize: 13, marginBottom: 18 }}>{t('stockStatus_hint')}</div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20 }}>
        <label style={{ fontSize: 12.5 }}>{t('stockStatus_day')}<br />
          <input className="input" type="date" value={fromDay} max={toDay} onChange={(e) => setFromDay(e.target.value)} />
        </label>
        <label style={{ fontSize: 12.5 }}>{t('stockStatus_toDay')}<br />
          <input className="input" type="date" value={toDay} min={fromDay} onChange={(e) => setToDay(e.target.value)} />
        </label>
        <label style={{ fontSize: 12.5 }}>{t('stockStatus_technician')}<br />
          <select className="input" value={techId} onChange={(e) => setTechId(e.target.value)}>
            <option value="">{t('stockStatus_all')}</option>
            {technicians.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <button className="btn" disabled={!docs || docs.length === 0} onClick={print}>{t('stockStatus_print')}</button>
      </div>

      {failed && <p>{t('nalogForm_unexpected')}</p>}
      {!docs && !failed && <Spinner label={t('jobBoard_loading')} />}
      {docs && docs.length === 0 && <p style={{ color: 'var(--stone)' }}>{t('stockStatus_empty')}</p>}
      {docs && docs.map((d) => (
        <div key={d.id} className="card" style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <strong>{d.type === 'ZAD' ? t('stockDoc_title_zad') : t('stockDoc_title_raz')} {d.docNo}</strong>
            <span style={{ color: 'var(--stone)', fontSize: 13 }}>
              {fmt(d.docAt)} · {d.technicianName}
              {d.nalogId && <> · {t('stockStatus_fromNalog')} <Link to={`/nalozi/${d.nalogId}`}>{d.nalogNumber}</Link></>}
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <tbody>
              {d.lines.map((l) => (
                <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 0', width: 120 }}>{l.sku ?? ''}</td>
                  <td>{l.name}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{l.quantity} {l.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
