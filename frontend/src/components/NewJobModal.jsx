import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LangContext';
import Modal from './Modal';

export default function NewJobModal({ onClose, onCreated }) {
  const { user } = useAuth();
  const { t } = useLang();
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [appliances, setAppliances] = useState([]);
  const [applianceId, setApplianceId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [priority, setPriority] = useState('normal');
  const [technicians, setTechnicians] = useState([]);
  const [assignedTo, setAssignedTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.customers.list(customerSearch).then(setCustomers).catch(() => {});
  }, [customerSearch]);

  useEffect(() => {
    if (user.role === 'admin') {
      api.users.list().then((u) => setTechnicians(u.filter((x) => x.role === 'technician' && x.active)));
    }
  }, [user.role]);

  useEffect(() => {
    if (!customerId) { setAppliances([]); setApplianceId(''); return; }
    api.customers.get(customerId).then((c) => {
      setAppliances(c.appliances || []);
      if (c.address && !address) {
        setAddress(c.address);
      }
    }).catch(() => {});
  }, [customerId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      setError(t('newJob_required'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.jobs.create({
        customer_id: customerId ? Number(customerId) : undefined,
        appliance_id: applianceId ? Number(applianceId) : undefined,
        title: title.trim(),
        description: description.trim() || undefined,
        address: address.trim() || undefined,
        priority,
        assigned_to: assignedTo ? Number(assignedTo) : undefined
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('newJob_title')} onClose={onClose} width={480}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>{t('newJob_customer')}</label>
          <input
            className="input"
            placeholder={t('newJob_searchCustomer')}
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">{t('newJob_selectCustomer')}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
            ))}
          </select>
          {customers.length === 0 && customerSearch && (
            <div style={{ fontSize: 12, color: 'var(--stone)', marginTop: 6 }}>
              {t('newJob_noMatches')}
            </div>
          )}
        </div>

        {appliances.length > 0 && (
          <div className="field">
            <label>{t('newJob_appliance')}</label>
            <select className="input" value={applianceId} onChange={(e) => setApplianceId(e.target.value)}>
              <option value="">{t('newJob_noneSpecified')}</option>
              {appliances.map((a) => (
                <option key={a.id} value={a.id}>{a.type} {a.brand ? `— ${a.brand} ${a.model || ''}` : ''}</option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label>{t('newJob_jobTitle')}</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={t('newJob_jobTitlePlaceholder')} required />
        </div>

        <div className="field">
          <label>{t('newJob_description')}</label>
          <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={t('newJob_descriptionPlaceholder')} />
        </div>

        <div className="field">
          <label>{t('newJob_address')}</label>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)}
            placeholder={t('newJob_addressPlaceholder')} />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>{t('newJob_priority')}</label>
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">{t('priority_low')}</option>
              <option value="normal">{t('priority_normal')}</option>
              <option value="high">{t('priority_high')}</option>
              <option value="urgent">{t('priority_urgent')}</option>
            </select>
          </div>
          {user.role === 'admin' && (
            <div className="field" style={{ flex: 1 }}>
              <label>{t('newJob_assignTo')}</label>
              <select className="input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">{t('jobModal_unassigned')}</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>{tech.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && (
          <div style={{ background: '#FBEAE5', color: 'var(--danger)', padding: '8px 10px', borderRadius: 4, marginBottom: 14, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn-secondary" onClick={onClose} style={{ padding: '8px 16px' }}>{t('newJob_cancel')}</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? t('newJob_creating') : t('newJob_create')}</button>
        </div>
      </form>
    </Modal>
  );
}
