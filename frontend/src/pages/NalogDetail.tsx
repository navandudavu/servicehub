import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { nalogApi } from '../api/nalog';
import { NalogApiError } from '../api/nalogApi';
import { NalogStatusTag } from '../components/NalogStatusTag';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import { useCurrentUser } from '../context/typedAuth';
import { useLang } from '../i18n/typedLang';
import { formatMoney, formatRate } from '../print/formatMoney';
import { NEXT_STATUSES, type NalogResponse, type NalogStatus, type StatusHistoryView, type TechnicianView } from '../types/nalog';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

export default function NalogDetail() {
  const { id } = useParams();
  const nalogId = Number(id);
  const { t, lang } = useLang();
  const locale = lang === 'sr' ? 'sr-Latn-RS' : 'en-GB';
  const user = useCurrentUser();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  const [nalog, setNalog] = useState<NalogResponse | null>(null);
  const [history, setHistory] = useState<StatusHistoryView[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianView[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [n, h] = await Promise.all([nalogApi.getNalog(nalogId, signal), nalogApi.getNalogHistory(nalogId, signal)]);
      setNalog(n); setHistory(h); setError('');
    } catch (e) {
      if (e instanceof NalogApiError) {
        if (e.status === 404) setNotFound(true);
        else if (e.message !== 'Request cancelled') setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }, [nalogId]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    nalogApi.listTechnicians().then(setTechnicians).catch(() => { /* dropdown stays empty */ });
  }, [isAdmin]);

  async function run(action: () => Promise<NalogResponse>) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      setNalog(await action());
      setHistory(await nalogApi.getNalogHistory(nalogId));
    } catch (e) {
      setError(e instanceof NalogApiError ? e.message : t('nalogForm_unexpected'));
      await load();                                   // show the server's current truth after a rejected move
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  }

  if (loading && !nalog) return <div style={{ padding: 20 }}><Spinner label={t('jobBoard_loading')} /></div>;
  if (notFound || !nalog) {
    return (
      <div>
        <Link to="/nalozi">{t('nalogDetail_back')}</Link>
        <p style={{ marginTop: 16 }}>{error || t('nalogDetail_notFound')}</p>
      </div>
    );
  }

  const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
  const closed = nalog.status === 'COMPLETED' || nalog.status === 'CANCELLED';
  const moves = NEXT_STATUSES[nalog.status].filter((s) => s !== 'CANCELLED');
  const canCancel = isAdmin && NEXT_STATUSES[nalog.status].includes('CANCELLED');
  const c = nalog.customer;
  const a = nalog.appliance;

  return (
    <div>
      <Link to="/nalozi" style={{ fontSize: 13 }}>{t('nalogDetail_back')}</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 20px', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, fontFamily: 'var(--mono)' }}>{nalog.nalogNumber}</h1>
          <NalogStatusTag status={nalog.status} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {moves.map((s: NalogStatus) => (
            <button key={s} className="btn" disabled={busy} onClick={() => run(() => nalogApi.changeStatus(nalog.id, s))}>
              {t('nalogDetail_nextActions')}: {t(`nalogStatus_${s}`)}
            </button>
          ))}
          <button className="btn-secondary" onClick={() => navigate(`/nalozi/${nalog.id}/print`)}>{t('nalogDetail_print')}</button>
          {canCancel && <button className="btn-danger-outline btn-sm" disabled={busy} onClick={() => setConfirmCancel(true)}>{t('nalogDetail_cancel')}</button>}
        </div>
      </div>

      {error && (
        <div role="alert" style={{ background: '#FBEAE5', color: 'var(--danger)', padding: '10px 14px', borderRadius: 4, marginBottom: 16, fontSize: 13 }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 20, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Card title={t('nalogDetail_customer')}>
              <div style={{ fontWeight: 600 }}>{c.fullName}</div>
              <div>{c.address}{c.city ? `, ${c.city}` : ''}</div>
              <div>{c.phone}{c.email ? ` · ${c.email}` : ''}</div>
              {c.locationNotes && <div style={{ color: 'var(--stone)', marginTop: 4 }}>{c.locationNotes}</div>}
            </Card>
            <Card title={t('nalogDetail_appliance')}>
              <div style={{ fontWeight: 600 }}>{t(`appliance_${a.type}`)} — {a.brand}{a.model ? ` ${a.model}` : ''}</div>
              <div style={{ color: 'var(--stone)' }}>{t('nalogDetail_serial')}: {a.serialNumber ?? '—'}</div>
            </Card>
          </div>

          <Card title={t('nalogDetail_diagnosis')}>
            <div style={{ whiteSpace: 'pre-wrap' }}>{nalog.diagnosis}</div>
          </Card>

          <Card title={t('nalogDetail_partsLabor')}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 0' }}>{t('nalogForm_labor')} ({nalog.laborHours} h × {formatMoney(nalog.laborRate)})</td>
                  <td style={{ textAlign: 'right' }}>{formatMoney(nalog.laborTotal)}</td>
                </tr>
                {nalog.partLines.map((l) => (
                  <tr key={l.partId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 0' }}>{l.name} <span style={{ color: 'var(--stone)' }}>({l.sku})</span> × {l.quantity} @ {formatMoney(l.unitPrice)}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(l.lineTotal)}</td>
                  </tr>
                ))}
                <tr><td style={{ paddingTop: 8 }}>{t('nalogForm_subtotal')}</td><td style={{ textAlign: 'right', paddingTop: 8 }}>{formatMoney(nalog.subtotal)}</td></tr>
                <tr><td>{t('nalogForm_vat')} {formatRate(nalog.vatRate)}</td><td style={{ textAlign: 'right' }}>{formatMoney(nalog.vatAmount)}</td></tr>
                <tr style={{ fontWeight: 700, fontSize: 16 }}>
                  <td style={{ paddingTop: 6 }}>{t('nalogForm_total')}</td>
                  <td style={{ textAlign: 'right', paddingTop: 6 }}>{formatMoney(nalog.total)} RSD</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: 10, color: 'var(--stone)', fontSize: 13 }}>{t('nalogForm_payment')}: {t(`payment_${nalog.paymentType}`)}</div>
          </Card>
        </div>

        <div>
          <Card title={t('nalogDetail_assignedTo')}>
            {isAdmin && !closed ? (
              <select className="input" disabled={busy} value={nalog.assignedToId ?? ''}
                      onChange={(e) => run(() => nalogApi.assignNalog(nalog.id, e.target.value ? Number(e.target.value) : null))}>
                <option value="">{t('nalogForm_unassigned')}</option>
                {technicians.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            ) : (
              <div>{nalog.assignedToName ?? t('nalogDetail_noOne')}</div>
            )}
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--stone)', display: 'grid', gap: 3 }}>
              {nalog.scheduledAt && <div>{t('nalogDetail_scheduled')}: {fmtDateTime(nalog.scheduledAt)}</div>}
              {nalog.completedAt && <div>{t('nalogDetail_completed')}: {fmtDateTime(nalog.completedAt)}</div>}
              <div>{t('nalogDetail_createdBy')}: {nalog.createdByName ?? '—'}</div>
            </div>
          </Card>

          <Card title={t('nalogDetail_history')}>
            {history.map((h, i) => (
              <div key={i} style={{ fontSize: 13, padding: '5px 0', borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontWeight: 500 }}>
                  {h.fromStatus ? `${t(`nalogStatus_${h.fromStatus}`)} → ` : `${t('nalogDetail_created')}: `}{t(`nalogStatus_${h.toStatus}`)}
                </div>
                <div style={{ color: 'var(--stone)', fontSize: 12 }}>{fmtDateTime(h.changedAt)}{h.changedByName ? ` · ${t('nalogDetail_by')} ${h.changedByName}` : ''}</div>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {confirmCancel && (
        <Modal title={t('nalogDetail_cancel')} onClose={() => setConfirmCancel(false)} width={400}>
          <p style={{ marginTop: 0 }}>{t('nalogDetail_cancelConfirm')}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setConfirmCancel(false)} disabled={busy}>{t('common_cancel')}</button>
            <button className="btn btn-danger" disabled={busy} onClick={() => run(() => nalogApi.changeStatus(nalog.id, 'CANCELLED'))}>
              {t('nalogDetail_cancel')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
