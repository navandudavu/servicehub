import { useLang } from '../i18n/typedLang';
import type { NalogEventView } from '../types/nalog';

/** The complete history of a nalog, oldest first: who did what and when. STATUS lines come as "FROM -> TO" codes and are translated here. */
export function NalogTimeline({ events }: { events: NalogEventView[] }) {
  const { t, lang } = useLang();
  const locale = lang === 'sr' ? 'sr-Latn-RS' : 'en-GB';
  const text = (e: NalogEventView) => {
    if (e.kind !== 'STATUS' || !e.detail) return e.detail ?? '';
    return e.detail.split(' -> ').map((s) => t(`nalogStatus_${s}`)).join(' → ');
  };
  return (
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>{t('timeline_title')}</div>
      {events.map((e, i) => (
        <div key={i} style={{ fontSize: 13, padding: '5px 0', borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>
            <span style={{ color: 'var(--stone)', fontWeight: 600 }}>{t(`timeline_${e.kind}`)}</span>{text(e) ? ` · ${text(e)}` : ''}
          </div>
          <div style={{ color: 'var(--stone)', fontSize: 12 }}>
            {new Date(e.at).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}{e.by ? ` · ${t('nalogDetail_by')} ${e.by}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
