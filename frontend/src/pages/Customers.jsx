import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { nalogApi } from '../api/nalog';
import { NalogStatusTag } from '../components/NalogStatusTag';
import { useLang } from '../i18n/LangContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Spinner from '../components/Spinner';
import { BulkBar } from '../components/BulkBar';
import { SelectBox } from '../components/SelectBox';
import { useSelection } from '../hooks/useSelection';
import EmptyState from '../components/EmptyState';
import { isAdminLevel } from '../context/roles';


export default function Customers() {
  const { t } = useLang();
  const { user } = useAuth();
  const isAdmin = isAdminLevel(user?.role);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);

  // Row selection: delete several customers at once (admin only; customers with nalozi are skipped by the server)
  const pageIds = useMemo(() => customers.map((c) => c.id), [customers]);
  const sel = useSelection(isAdmin ? pageIds : []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState({ text: '', error: false });

  async function bulkDelete() {
    setBulkBusy(true);
    setBulkMsg({ text: '', error: false });
    try {
      const r = await nalogApi.bulkDeleteCustomers(sel.selectedIds);
      const names = r.skipped.map((s) => s.fullName || `#${s.id}`).join(', ');
      setBulkMsg({ text: t('bulk_customersResult', r.deleted, names), error: false });
      sel.clear();
      await load();
    } catch (err) {
      setBulkMsg({ text: err.message, error: true });
    } finally {
      setBulkBusy(false);
      setConfirmDelete(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const data = await nalogApi.listCustomers(search.trim() || undefined);
      setCustomers(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>{t('customers_title')}</h1>
          <div style={{ fontSize: 13, color: 'var(--stone)' }}>{t('customers_onFile', customers.length)}</div>
        </div>
        <button className="btn" onClick={() => setShowNew(true)}>{t('customers_new')}</button>
      </div>

      <input
        className="input"
        placeholder={t('customers_search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: 320, marginBottom: 18 }}
      />

      {isAdmin && sel.count > 0 && (
        <BulkBar count={sel.count} onClear={sel.clear}>
          <button type="button" className="btn btn-sm" disabled={bulkBusy}
                  style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
                  onClick={() => setConfirmDelete(true)}>{t('bulk_delete')}</button>
        </BulkBar>
      )}

      {bulkMsg.text && (
        <div role={bulkMsg.error ? 'alert' : 'status'}
             style={{ fontSize: 13, marginBottom: 14, color: bulkMsg.error ? 'var(--danger)' : 'var(--stone)' }}>
          {bulkMsg.text}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '20px 0' }}><Spinner label={t('jobBoard_loading')} /></div>
      ) : customers.length === 0 ? (
        <div className="card">
          <EmptyState icon="👤" message={t('customers_none')} />
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {isAdmin && (
                  <th style={{ padding: '10px 0 10px 14px', width: 32, textAlign: 'left' }}>
                    <SelectBox checked={sel.allSelected} indeterminate={sel.someSelected} onChange={sel.toggleAll} label={t('bulk_selectAll')} />
                  </th>
                )}
                <Th>{t('customers_name')}</Th>
                <Th>{t('customers_phone')}</Th>
                <Th>{t('customers_address')}</Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer',
                           background: sel.isSelected(c.id) ? 'var(--paper)' : undefined }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--paper)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = sel.isSelected(c.id) ? 'var(--paper)' : 'transparent'}
                >
                  {isAdmin && (
                    <td style={{ padding: '10px 0 10px 14px' }}>
                      <SelectBox checked={sel.isSelected(c.id)} onChange={() => sel.toggle(c.id)} label={t('bulk_selectRow')} />
                    </td>
                  )}
                  <Td><strong>{c.fullName}</strong></Td>
                  <Td>{c.phone || '—'}</Td>
                  <Td>{c.address || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog message={t('bulk_confirmDeleteCustomers', sel.count)} busy={bulkBusy}
                       onCancel={() => setConfirmDelete(false)} onConfirm={bulkDelete} />
      )}
      {showNew && (
        <NewCustomerModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />
      )}
      {selected && (
        <CustomerDetailModal customerId={selected} onClose={() => setSelected(null)} onChanged={load} />
      )}
    </div>
  );
}

function Th({ children }) {
  return <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11.5, fontWeight: 600, color: 'var(--stone)' }}>{children}</th>;
}
function Td({ children, ...props }) {
  return <td style={{ padding: '10px 14px' }} {...props}>{children}</td>;
}

function NewCustomerModal({ onClose, onCreated }) {
  const { t } = useLang();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError(t('customers_nameRequired'));
    if (!phone.trim()) return setError(t('customers_phoneRequired'));
    if (!address.trim()) return setError(t('customers_addressRequired'));
    setBusy(true);
    setError('');
    try {
      await nalogApi.createCustomer({
        fullName: name.trim(), phone: phone.trim(), address: address.trim(), city: city.trim() || null
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('customers_newTitle')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>{t('customers_name')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>{t('customers_phone')}</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div className="field">
          <label>{t('customers_address')}</label>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} required />
        </div>
        <div className="field">
          <label>{t('customers_city')}</label>
          <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn-secondary" onClick={onClose} style={{ padding: '8px 16px' }}>{t('newJob_cancel')}</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? t('customers_saving') : t('customers_save')}</button>
        </div>
      </form>
    </Modal>
  );
}

function CustomerDetailModal({ customerId, onClose, onChanged }) {
  const { t } = useLang();
  const { user } = useAuth();
  const [detail, setDetail] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    let alive = true;
    nalogApi.getCustomer(customerId).then((d) => { if (alive) setDetail(d); }).catch((err) => { if (alive) setDeleteError(err.message); });
    return () => { alive = false; };
  }, [customerId]);

  async function handleConfirmDelete() {
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await nalogApi.deleteCustomer(customerId);
      onChanged();
      onClose();
    } catch (err) {
      setDeleteError(err.message);
      setShowDeleteConfirm(false);
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!detail) return null;
  const c = detail.customer;

  return (
    <Modal title={c.fullName} onClose={onClose} width={520}>
      <div style={{ fontSize: 13.5, marginBottom: 18, color: 'var(--stone)' }}>
        <div>{c.phone}</div>
        <div>{c.address}{c.city ? `, ${c.city}` : ''}</div>
        {c.email && <div>{c.email}</div>}
        {c.locationNotes && <div>{c.locationNotes}</div>}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--stone)', marginBottom: 8 }}>{t('customers_jobHistory')}</div>
        {detail.nalozi.length === 0 && <div style={{ fontSize: 13, color: 'var(--stone)' }}>{t('customers_noJobs')}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {detail.nalozi.map((n) => (
            <Link key={n.id} to={`/nalozi/${n.id}`} className="card"
              style={{ padding: '8px 12px', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8, textDecoration: 'none', color: 'inherit' }}>
              <span>
                <strong>{n.nalogNumber}</strong>
                {n.applianceBrand ? ` — ${n.applianceBrand} ${n.applianceModel || ''}` : ''}
                <span style={{ color: 'var(--stone)' }}> · {new Date(n.createdAt).toLocaleDateString()}</span>
              </span>
              <NalogStatusTag status={n.status} />
            </Link>
          ))}
        </div>
      </div>

      {deleteError && (
        <div style={{ background: '#FBEAE5', color: 'var(--danger)', padding: '8px 10px', borderRadius: 4, marginBottom: 12, fontSize: 13 }}>
          {deleteError}
        </div>
      )}
      {isAdminLevel(user?.role) && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <button className="btn-danger-outline btn-sm" onClick={() => setShowDeleteConfirm(true)} disabled={deleteBusy}>
            {t('customers_delete')}
          </button>
        </div>
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          message={t('customers_deleteConfirm', c.fullName)}
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          busy={deleteBusy}
        />
      )}
    </Modal>
  );
}
