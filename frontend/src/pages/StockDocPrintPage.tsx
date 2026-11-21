import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { nalogApi } from '../api/nalog';
import Spinner from '../components/Spinner';
import { useLang } from '../i18n/typedLang';
import { COMPANY } from '../print/company';
import type { StockDocType, StockDocView } from '../types/nalog';

const CSS = `
  @page { size: A4; margin: 14mm; }
  .sd-print { font: 12px/1.4 Arial, Helvetica, sans-serif; color: #000; max-width: 182mm; margin: 0 auto; }
  .sd-print .doc { break-inside: avoid; page-break-inside: avoid; margin-bottom: 14mm; }
  .sd-print .doc + .doc { border-top: 1px dashed #999; padding-top: 8mm; }
  .sd-print .head { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #000; padding-bottom: 6px; }
  .sd-print .head img { width: 54px; height: 54px; border-radius: 50%; }
  .sd-print .head .name { font-size: 20px; font-weight: bold; }
  .sd-print .head .sub { font-size: 11px; color: #333; }
  .sd-print h1 { font-size: 16px; text-align: center; margin: 12px 0 6px; }
  .sd-print .meta { margin-bottom: 6px; }
  .sd-print .tech { border: 1px solid #000; width: 90mm; margin-bottom: 10px; }
  .sd-print .tech div:first-child { border-bottom: 1px solid #000; text-align: center; font-weight: bold; }
  .sd-print .tech div { padding: 2px 6px; }
  .sd-print table { width: 100%; border-collapse: collapse; }
  .sd-print th, .sd-print td { border: 1px solid #000; padding: 3px 6px; text-align: left; }
  .sd-print .num { text-align: right; white-space: nowrap; }
  .sd-print .sign { display: flex; justify-content: space-between; margin-top: 16mm; }
  .sd-print .sign div { width: 60mm; border-top: 1px solid #000; padding-top: 3px; text-align: center; }
  .sd-print .edited { margin-top: 4px; font-size: 10px; color: #555; }
  @media print { .no-print { display: none !important; } }
`;

/**
 * Standalone page (no sidebar): one Zaduzenje / Razduzenje as the paper the old software printed
 * (?id=), or all documents of a filter (?type=&technicianId=&from=&to=) one after another.
 * Quantities are printed as the strings the server sent.
 */
export default function StockDocPrintPage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const id = search.get('id');
  const type = search.get('type') as StockDocType | null;
  const technicianId = search.get('technicianId');
  const from = search.get('from');
  const to = search.get('to');

  const [docs, setDocs] = useState<StockDocView[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const load = id
      ? nalogApi.getStockDoc(Number(id), ctrl.signal).then((d) => [d])
      : nalogApi.fullStockDocs({
          ...(type ? { type } : {}),
          ...(technicianId ? { technicianId: Number(technicianId) } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        }, ctrl.signal);
    load.then(setDocs).catch(() => { if (!ctrl.signal.aborted) setFailed(true); });
    return () => ctrl.abort();
  }, [id, type, technicianId, from, to]);

  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === 'sr' ? 'sr-Latn-RS' : 'en-GB', { timeZone: 'Europe/Belgrade' });
  const backTo = search.get('back');
  const back = () => navigate(backTo ?? (id && docs?.[0] ? (docs[0].type === 'ZAD' ? '/zaduzenje' : '/razduzenje') : (type === 'RAZ' ? '/razduzenje' : '/zaduzenje')));

  return (
    <div style={{ background: '#fff', minHeight: '100vh', padding: 24 }}>
      <div className="no-print" style={{ display: 'flex', gap: 8, maxWidth: '182mm', margin: '0 auto 20px' }}>
        <button className="btn-secondary" onClick={back}>{t('nalogPrint_back')}</button>
        <button className="btn" disabled={!docs || docs.length === 0} onClick={() => window.print()}>{t('nalogPrint_print')}</button>
      </div>
      {failed && <p>{t('nalogForm_unexpected')}</p>}
      {!docs && !failed && <Spinner label={t('jobBoard_loading')} />}
      {docs && docs.length === 0 && <p>{t('stockDoc_empty')}</p>}
      {docs && docs.length > 0 && (
        <div className="sd-print">
          <style>{CSS}</style>
          {docs.map((d) => (
            <div className="doc" key={d.id}>
              <div className="head">
                <img src="/elgor-logo.png" alt="" />
                <div>
                  <div className="name">{COMPANY.name}</div>
                  <div className="sub">{COMPANY.address} · {COMPANY.email}</div>
                </div>
              </div>
              <h1>{d.type === 'ZAD' ? t('stockDoc_printTitle_zad') : t('stockDoc_printTitle_raz')} {d.docNo}</h1>
              <div className="meta">{t('stockDoc_datetime')}: {fmt(d.docAt)}</div>
              <div className="tech"><div>{t('stockDoc_technician')}:</div><div>{d.technicianName}</div></div>
              <table>
                <thead>
                  <tr><th>{t('stockDoc_sku')}</th><th>{t('stockDoc_description')}</th><th className="num">{t('stockDoc_quantity')}</th><th>{t('stockDoc_unit')}</th></tr>
                </thead>
                <tbody>
                  {d.lines.map((l) => (
                    <tr key={l.id}><td>{l.sku ?? ''}</td><td>{l.name}</td><td className="num">{l.quantity}</td><td>{l.unit}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="sign"><div>{t('stockDoc_issued')}</div><div>{t('stockDoc_received')}</div></div>
              {d.updatedByName && <div className="edited">{t('stockDoc_editedBy')}: {d.updatedByName}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
