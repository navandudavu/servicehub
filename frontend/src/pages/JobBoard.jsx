import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LangContext';
import JobModal from '../components/JobModal';
import NewJobModal from '../components/NewJobModal';
import ConfirmDialog from '../components/ConfirmDialog';
import Spinner from '../components/Spinner';

const COLUMN_KEYS = ['pending', 'assigned', 'in_progress', 'finished'];

export default function JobBoard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [showNewJob, setShowNewJob] = useState(false);
  const [showAll, setShowAll] = useState(user?.role === 'admin');

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [technicians, setTechnicians] = useState([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      const data = await api.jobs.list(showAll ? { all: 1 } : {});
      setJobs(data);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (user?.role === 'admin') {
      api.users.list().then((u) => setTechnicians(u.filter((x) => x.role === 'technician' && x.active)));
    }
  }, [user?.role]);

  function toggleSelectJob(id, e) {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    if (selectedIds.size === jobs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(jobs.map((j) => j.id)));
    }
  }

  async function handleBulkStatus(status) {
    if (selectedIds.size === 0 || !status) return;
    setBulkBusy(true);
    setError('');
    try {
      await api.jobs.bulkStatus(Array.from(selectedIds), status);
      setSelectedIds(new Set());
      await loadJobs();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkAssign(techId) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setError('');
    try {
      await api.jobs.bulkAssign(Array.from(selectedIds), techId || null);
      setSelectedIds(new Set());
      await loadJobs();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setError('');
    try {
      await api.jobs.bulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
      await loadJobs();
    } catch (err) {
      setError(err.message);
      setShowBulkDeleteConfirm(false);
    } finally {
      setBulkBusy(false);
    }
  }

  const columns = COLUMN_KEYS.map((key) => ({
    key,
    label: t(`status_${key}`),
    jobs: jobs.filter((j) => j.status === key)
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>{t('jobBoard_title')}</h1>
          <div style={{ fontSize: 13, color: 'var(--stone)' }}>
            {t('jobBoard_jobsCount', jobs.length)}
            {user?.role === 'technician' && !showAll ? t('jobBoard_assignedToYou') : t('jobBoard_total')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className={selectMode ? 'btn' : 'btn-secondary btn-sm'}
            onClick={() => {
              setSelectMode(!selectMode);
              if (selectMode) setSelectedIds(new Set());
            }}
          >
            {selectMode ? t('jobBoard_deselectAll') : t('jobBoard_selectMultiple')}
          </button>
          {user?.role === 'admin' && (
            <button className="btn-secondary btn-sm" onClick={() => setShowAll(!showAll)}>
              {showAll ? t('jobBoard_showMine') : t('jobBoard_showAll')}
            </button>
          )}
          <button className="btn" onClick={() => setShowNewJob(true)}>{t('jobBoard_newJob')}</button>
        </div>
      </div>

      {selectMode && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: 'var(--paper)' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {t('jobBoard_selectedCount', selectedIds.size)}
          </div>
          <button className="btn-secondary btn-xs" onClick={handleSelectAll}>
            {selectedIds.size === jobs.length ? t('jobBoard_deselectAll') : t('jobBoard_selectAll')}
          </button>

          {selectedIds.size > 0 && (
            <>
              <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

              <select
                className="input"
                style={{ width: 'auto', padding: '4px 8px', fontSize: 12.5 }}
                defaultValue=""
                onChange={(e) => { handleBulkStatus(e.target.value); e.target.value = ''; }}
                disabled={bulkBusy}
              >
                <option value="" disabled>{t('jobBoard_bulkStatus')}</option>
                {COLUMN_KEYS.concat('cancelled').map((k) => (
                  <option key={k} value={k}>{t(`status_${k}`)}</option>
                ))}
              </select>

              {user?.role === 'admin' && (
                <select
                  className="input"
                  style={{ width: 'auto', padding: '4px 8px', fontSize: 12.5 }}
                  defaultValue=""
                  onChange={(e) => { handleBulkAssign(e.target.value); e.target.value = ''; }}
                  disabled={bulkBusy}
                >
                  <option value="" disabled>{t('jobBoard_bulkAssign')}</option>
                  <option value="unassign">{t('jobModal_unassigned')}</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>{tech.name}</option>
                  ))}
                </select>
              )}

              {(user?.role === 'admin') && (
                <button
                  className="btn-danger-outline btn-xs"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  disabled={bulkBusy}
                >
                  {t('jobBoard_bulkDelete')}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {error && (
        <div style={{ background: '#FBEAE5', color: 'var(--danger)', padding: '10px 14px', borderRadius: 4, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '20px 0' }}><Spinner label={t('jobBoard_loading')} /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {columns.map((col) => (
            <div key={col.key}>
              <div style={{
                fontSize: 12, fontWeight: 600, color: 'var(--stone)', marginBottom: 10,
                display: 'flex', justifyContent: 'space-between', paddingBottom: 8,
                borderBottom: '1px solid var(--border)'
              }}>
                <span>{col.label}</span>
                <span>{col.jobs.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {col.jobs.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--stone)', padding: '8px 2px' }}>{t('jobBoard_noJobsHere')}</div>
                )}
                {col.jobs.map((job) => {
                  const isChecked = selectedIds.has(job.id);
                  return (
                    <div
                      key={job.id}
                      onClick={() => {
                        if (selectMode) toggleSelectJob(job.id);
                        else setSelectedJob(job.id);
                      }}
                      className={`card priority-${job.priority}`}
                      style={{
                        textAlign: 'left', padding: '11px 12px', cursor: 'pointer',
                        display: 'block', width: '100%', position: 'relative',
                        border: selectMode && isChecked ? '2px solid var(--primary)' : undefined
                      }}
                    >
                      {selectMode && (
                        <div style={{ position: 'absolute', top: 8, right: 8 }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => toggleSelectJob(job.id, e)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                          />
                        </div>
                      )}
                      <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 4, paddingRight: selectMode ? 24 : 0 }}>{job.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 6 }}>{job.customer_name || t('jobBoard_noCustomer')}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {job.appliance_type && <span className="tag">{job.appliance_type}</span>}
                        {job.assigned_to_name && <span className="tag">{job.assigned_to_name}</span>}
                        {job.hours_logged != null && <span className="tag">{job.hours_logged}{t('jobBoard_hoursSuffix')}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedJob && (
        <JobModal
          jobId={selectedJob}
          onClose={() => setSelectedJob(null)}
          onChanged={loadJobs}
        />
      )}
      {showNewJob && (
        <NewJobModal
          onClose={() => setShowNewJob(false)}
          onCreated={() => { setShowNewJob(false); loadJobs(); }}
        />
      )}
      {showBulkDeleteConfirm && (
        <ConfirmDialog
          message={t('jobBoard_bulkDeleteConfirm', selectedIds.size)}
          onConfirm={handleBulkDelete}
          onCancel={() => setShowBulkDeleteConfirm(false)}
          busy={bulkBusy}
        />
      )}
    </div>
  );
}
