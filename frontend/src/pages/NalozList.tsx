import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nalogApi } from '../api/nalog';
import { NalogApiError } from '../api/nalogApi';
import { NalogStatusTag } from '../components/NalogStatusTag';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import { BulkBar } from '../components/BulkBar';
import { SelectBox } from '../components/SelectBox';
import Spinner from '../components/Spinner';
import { useCurrentUser } from '../context/typedAuth';
import { useLang } from '../i18n/typedLang';
import { usePolling } from '../hooks/usePolling';
import { useSelection } from '../hooks/useSelection';
import { formatMoney } from '../print/formatMoney';
import { NALOG_STATUSES, type NalogStatus, type NalogSummary, type PageResponse, type TechnicianView } from '../types/nalog';

const PAGE_SIZE = 20;
const BASE_COLS = '120px 1.4fr 1.2fr 130px 1fr 120px';

export default function NalozList() {
  const { t, lang } = useLang();
  const locale = lang === 'sr' ? 'sr-Latn-RS' : 'en-GB';
  const user = useCurrentUser();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  const [status, setStatus] = useState<NalogStatus | ''>('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [page, setPage] = useState(0);
  const [technicians, setTechnicians] = useState<TechnicianView[]>([]);
  const [technicianError, setTechnicianError] = useState('');
  const [data, setData] = useState<PageResponse<NalogSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Row selection and bulk actions (admin only: the server refuses them for everybody else)
  const cols = isAdmin ? `32px ${BASE_COLS}` : BASE_COLS;
  const pageIds = useMemo(() => data?.items.map((n) => n.id) ?? [], [data]);
  const sel = useSelection(isAdmin ? pageIds : []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingAssign, setPendingAssign] = useState<{ id: number | null; name: string } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQuery(query.trim()); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!isAdmin) return;
    const ctrl = new AbortController();
    nalogApi.listTechnicians(ctrl.signal).then(setTechnicians).catch((e) => {
      if (!ctrl.signal.aborted && !(e instanceof NalogApiError && e.message === 'Request cancelled')) {
        setTechnicianError(e instanceof Error ? e.message : 'Technician list refresh failed');
      }
    });
    return () => ctrl.abort();
  }, [isAdmin]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    nalogApi.listNalozi({
      status: status || undefined,
      q: debouncedQuery || undefined,
      assignedTo: isAdmin && assignedTo ? Number(assignedTo) : undefined,
      page, size: PAGE_SIZE,
    }, ctrl.signal)
      .then((d) => { setData(d); setError(''); })
      .catch((e) => {
        if (e instanceof NalogApiError && e.message !== 'Request cancelled') setError(e.message);
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [status, debouncedQuery, assignedTo, page, isAdmin]);

  // Background refresh of the current page, so new or changed nalozi show up without F5. A result is dropped
  // if the filters or page changed while it was in flight.
  const listKey = JSON.stringify([status, debouncedQuery, assignedTo, page, isAdmin]);
  const listKeyRef = useRef(listKey);
  listKeyRef.current = listKey;
  usePolling(async () => {
    if (loading) return;
    const key = listKey;
    const d = await nalogApi.listNalozi({
      status: status || undefined,
      q: debouncedQuery || undefined,
      assignedTo: isAdmin && assignedTo ? Number(assignedTo) : undefined,
      page, size: PAGE_SIZE,
    });
    if (key !== listKeyRef.current) return;
    setData(d);
  }, 20000);

  async function runBulk(action: () => Promise<unknown>) {
    setBulkBusy(true);
    setBulkError('');
    try {
      await action();
      sel.clear();
      setData(await nalogApi.listNalozi({
        status: status || undefined,
        q: debouncedQuery || undefined,
        assignedTo: isAdmin && assignedTo ? Number(assignedTo) : undefined,
        page, size: PAGE_SIZE,
      }));
    } catch (e) {
      setBulkError(e instanceof NalogApiError ? e.message : t('nalogForm_unexpected'));
    } finally {
      setBulkBusy(false);
      setConfirmDelete(false);
      setPendingAssign(null);
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{t('nalog_title')}</h1>
          {data && <div style={{ color: 'var(--stone)', fontSize: 13, marginTop: 2 }}>{t('nalog_count', data.totalItems)}</div>}
        </div>
        <Link to="/nalozi/new" className="btn" style={{ textDecoration: 'none' }}>{t('nalog_new')}</Link>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 340 }} placeholder={t('nalog_search')}
               value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="input" style={{ width: 'auto' }} value={status}
                onChange={(e) => { setStatus(e.target.value as NalogStatus | ''); setPage(0); }}>
          <option value="">{t('nalog_allStatuses')}</option>
          {NALOG_STATUSES.map((s) => <option key={s} value={s}>{t(`nalogStatus_${s}`)}</option>)}
        </select>
        {isAdmin && (
          <select className="input" style={{ width: 'auto' }} value={assignedTo}
                  onChange={(e) => { setAssignedTo(e.target.value); setPage(0); }}>
            <option value="">{t('nalog_allTechs')}</option>
            {technicians.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
      </div>

      {isAdmin && sel.count > 0 && (
        <BulkBar count={sel.count} onClear={sel.clear}>
          <select className="input" style={{ width: 'auto' }} value="" disabled={bulkBusy}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    setPendingAssign(v === 'none'
                      ? { id: null, name: t('nalogForm_unassigned') }
                      : { id: Number(v), name: technicians.find((x) => String(x.id) === v)?.name ?? '' });
                  }}>
            <option value="">{t('bulk_assignTo')}</option>
            <option value="none">{t('nalogForm_unassigned')}</option>
            {technicians.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <button type="button" className="btn btn-sm" disabled={bulkBusy}
                  style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
                  onClick={() => setConfirmDelete(true)}>{t('bulk_delete')}</button>
        </BulkBar>
      )}

      {bulkError && (
        <div role="alert" style={{ background: '#FBEAE5', color: 'var(--danger)', padding: '10px 14px', borderRadius: 4, marginBottom: 16, fontSize: 13 }}>
          {bulkError}
        </div>
      )}

      {technicianError && (
        <div role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>
          {`Unable to refresh technician list: ${technicianError}`}
        </div>
      )}

      {error && (
        <div role="alert" style={{ background: '#FBEAE5', color: 'var(--danger)', padding: '10px 14px', borderRadius: 4, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '9px 16px', fontSize: 11.5, fontWeight: 600, color: 'var(--stone)', borderBottom: '1px solid var(--border)', background: 'var(--paper)' }}>
          {isAdmin && (
            <div><SelectBox checked={sel.allSelected} indeterminate={sel.someSelected} onChange={sel.toggleAll} label={t('bulk_selectAll')} /></div>
          )}
          <div>{t('nalog_col_number')}</div><div>{t('nalog_col_customer')}</div><div>{t('nalog_col_appliance')}</div>
          <div>{t('nalog_col_status')}</div><div>{t('nalog_col_assigned')}</div><div style={{ textAlign: 'right' }}>{t('nalog_col_total')}</div>
        </div>

        {loading && !data ? (
          <div style={{ padding: 20 }}><Spinner label={t('jobBoard_loading')} /></div>
        ) : data && data.items.length === 0 ? (
          <EmptyState message={t('nalog_empty')} action={null} />
        ) : (
          data?.items.map((n) => (
            <div key={n.id} onClick={() => navigate(`/nalozi/${n.id}`)} role="link" tabIndex={0}
                 onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/nalozi/${n.id}`); }}
                 style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', alignItems: 'center', opacity: loading ? 0.6 : 1,
                          background: sel.isSelected(n.id) ? 'var(--paper)' : undefined }}>
              {isAdmin && (
                <div><SelectBox checked={sel.isSelected(n.id)} onChange={() => sel.toggle(n.id)} label={t('bulk_selectRow')} /></div>
              )}
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12.5, fontWeight: 500 }}>{n.nalogNumber}</div>
                <div style={{ fontSize: 11.5, color: 'var(--stone)' }}>{fmtDate(n.createdAt)}</div>
              </div>
              <div>
                <div style={{ fontWeight: 500 }}>{n.customerName}</div>
                <div style={{ fontSize: 12, color: 'var(--stone)' }}>{n.customerPhone}</div>
              </div>
              <div style={{ fontSize: 13 }}>{t(`appliance_${n.applianceType}`)} · {n.applianceBrand}</div>
              <div><NalogStatusTag status={n.status} /></div>
              <div style={{ fontSize: 13 }}>{n.assignedToName ?? <span style={{ color: 'var(--stone)' }}>—</span>}</div>
              <div style={{ textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(n.total)}</div>
            </div>
          ))
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog message={t('bulk_confirmDeleteNalozi', sel.count)} busy={bulkBusy}
                       onCancel={() => setConfirmDelete(false)}
                       onConfirm={() => runBulk(() => nalogApi.bulkDeleteNalozi(sel.selectedIds))} />
      )}
      {pendingAssign && (
        <ConfirmDialog danger={false} confirmLabel={t('bulk_assignConfirm')} busyLabel="…" busy={bulkBusy}
                       message={pendingAssign.id === null
                         ? t('bulk_confirmUnassign', sel.count)
                         : t('bulk_confirmAssign', sel.count, pendingAssign.name)}
                       onCancel={() => setPendingAssign(null)}
                       onConfirm={() => runBulk(() => nalogApi.bulkAssignNalozi(sel.selectedIds, pendingAssign.id))} />
      )}

      {data && data.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 16 }}>
          <button className="btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{t('nalog_prev')}</button>
          <span style={{ fontSize: 13, color: 'var(--stone)' }}>{t('nalog_pageOf', data.page + 1, data.totalPages)}</span>
          <button className="btn-secondary btn-sm" disabled={page + 1 >= data.totalPages} onClick={() => setPage((p) => p + 1)}>{t('nalog_next')}</button>
        </div>
      )}
    </div>
  );
}
