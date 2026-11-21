import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { nalogApi } from '../api/nalog';
import { NalogPrint } from '../components/NalogPrint';
import Spinner from '../components/Spinner';
import { useLang } from '../i18n/typedLang';
import { COMPANY } from '../print/company';
import type { MaterialLine, NalogResponse, NoteView } from '../types/nalog';

/** Standalone page (no sidebar) so the printout is just the document. */
export default function NalogPrintPage() {
  const { id } = useParams();
  const { t } = useLang();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const revers = search.get('revers') === '1';
  const [nalog, setNalog] = useState<NalogResponse | null>(null);
  const [notes, setNotes] = useState<NoteView[]>([]);
  const [material, setMaterial] = useState<MaterialLine[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    nalogApi.getNalog(Number(id), ctrl.signal).then(setNalog).catch(() => { if (!ctrl.signal.aborted) setFailed(true); });
    nalogApi.listNotes(Number(id), ctrl.signal).then(setNotes).catch(() => { /* printed without konstatacije rather than not at all */ });
    nalogApi.listMaterial(Number(id), ctrl.signal).then(setMaterial).catch(() => { /* same: print without it */ });
    return () => ctrl.abort();
  }, [id]);

  return (
    <div style={{ background: '#fff', minHeight: '100vh', padding: 24 }}>
      <div className="no-print" style={{ display: 'flex', gap: 8, maxWidth: '182mm', margin: '0 auto 20px' }}>
        <button className="btn-secondary" onClick={() => navigate(`/nalozi/${id}`)}>{t('nalogPrint_back')}</button>
        <button className="btn" disabled={!nalog} onClick={() => window.print()}>{t('nalogPrint_print')}</button>
      </div>
      {failed && <p>{t('nalogDetail_notFound')}</p>}
      {!nalog && !failed && <Spinner label={t('jobBoard_loading')} />}
      {nalog && <NalogPrint nalog={nalog} notes={notes} material={material} company={COMPANY} revers={revers} />}
    </div>
  );
}
