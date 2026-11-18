import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { nalogApi } from '../api/nalog';
import { NalogApiError } from '../api/nalogApi';
import Modal from './Modal';
import { useLang } from '../i18n/typedLang';
import {
  APPLIANCE_TYPES, PAYMENT_TYPES,
  type ApplianceType, type CreateNalogRequest, type CustomerView, type NalogResponse,
  type PaymentType, type TechnicianView, type UpdateNalogRequest,
} from '../types/nalog';

/**
 * Create-nalog form.
 *
 * RULE A: this component NEVER adds, multiplies or rounds money. It collects input,
 * asks the backend for a preview, and prints exactly what comes back.
 * Double-submit safety: one Idempotency-Key per form instance + a busy guard.
 */
interface Props {
  isAdmin: boolean;
  onCreated?: (nalog: NalogResponse) => void;
  /** Edit mode: the (unfinished) nalog being changed. The form starts filled from it and saves with PUT. */
  editing?: NalogResponse;
  onSaved?: (nalog: NalogResponse) => void;
}

const LABOR_HOURS_RE = /^\d{1,3}(\.\d{1,2})?$/;
const PRICE_RE = /^\d{1,8}(\.\d{1,2})?$/;

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginTop: 3 }}>{error}</div>}
    </div>
  );
}

const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' } as const;

export function NalogForm({ isAdmin, onCreated, editing, onSaved }: Props) {
  const { t } = useLang();

  // --- customer ---
  const [customer, setCustomer] = useState<CustomerView | null>(editing?.customer ?? null);   // picked existing customer
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerView[]>([]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [locationNotes, setLocationNotes] = useState('');

  // --- appliance / issue ---
  const [applianceType, setApplianceType] = useState<ApplianceType>(editing?.appliance.type ?? 'AIR_CONDITIONER');
  const [applianceTypes, setApplianceTypes] = useState<string[]>([...APPLIANCE_TYPES].filter((a) => a !== 'OTHER'));
  const [newTypeOpen, setNewTypeOpen] = useState(false);
  const [brand, setBrand] = useState(editing?.appliance.brand ?? '');
  const [model, setModel] = useState(editing?.appliance.model ?? '');
  const [serialNumber, setSerialNumber] = useState(editing?.appliance.serialNumber ?? '');
  const [diagnosis, setDiagnosis] = useState(editing?.diagnosis ?? '');

  // --- price (typed by hand) ---
  const [laborHours, setLaborHours] = useState(editing?.laborHours ?? '0.00');
  const [price, setPrice] = useState(editing ? editing.total : '');

  // --- misc ---
  const [paymentType, setPaymentType] = useState<PaymentType>(editing?.paymentType ?? 'CASH');
  const [initialStatus, setInitialStatus] = useState<'DRAFT' | 'DISPATCHED'>('DRAFT');
  const [scheduledAt, setScheduledAt] = useState('');          // date (YYYY-MM-DD)
  const [technicians, setTechnicians] = useState<TechnicianView[]>([]);
  const [technicianError, setTechnicianError] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState('');

  // --- submit state ---
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // One key per form instance: double-clicks and retries after a timeout reuse it,
  // so the server can never create two nalozi from one submit.
  const idempotencyKey = useRef(nalogApi.newIdempotencyKey());

  // Admin: who can it be assigned to?
  useEffect(() => {
    if (!isAdmin || editing) return;                  // assignment is not part of an edit
    const ctrl = new AbortController();
    nalogApi.listTechnicians(ctrl.signal).then(setTechnicians).catch((e) => {
      if (!ctrl.signal.aborted && !(e instanceof NalogApiError && e.message === 'Request cancelled')) {
        setTechnicianError(e instanceof Error ? e.message : 'Technician list refresh failed');
      }
    });
    return () => ctrl.abort();
  }, [isAdmin, editing]);

  // Debounced existing-customer lookup.
  useEffect(() => {
    if (customer || customerQuery.trim().length < 2) { setCustomerResults([]); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      nalogApi.searchCustomers(customerQuery.trim(), ctrl.signal)
        .then(setCustomerResults)
        .catch(() => { /* next keystroke retries */ });
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [customerQuery, customer]);

  // The device-type dropdown: built-in types first, then the ones added with "Dodaj novi uredjaj".
  useEffect(() => {
    const ctrl = new AbortController();
    nalogApi.listApplianceTypes(ctrl.signal).then(setApplianceTypes).catch(() => { /* the built-in list stays */ });
    return () => ctrl.abort();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;                           // guard against double submit
    setFormError(null);
    setFieldErrors({});

    if (!LABOR_HOURS_RE.test(laborHours)) {
      setFieldErrors({ laborHours: t('nalogForm_hoursInvalid') });
      return;
    }
    const priceValue = price.trim().replace(',', '.');
    if (priceValue && !PRICE_RE.test(priceValue)) {
      setFieldErrors({ price: t('nalogForm_priceInvalid') });
      return;
    }

    if (editing) {
      const update: UpdateNalogRequest = {
        customerId: customer ? customer.id : null,
        newCustomer: customer ? null : {
          fullName, phone, address,
          city: city || null,
          locationNotes: locationNotes || null,
        },
        appliance: { type: applianceType, brand, model: model || null, serialNumber: serialNumber || null },
        diagnosis,
        laborHours,
        price: priceValue || null,
        paymentType,
        expectedVersion: editing.version,
      };
      setSubmitting(true);
      try {
        onSaved?.(await nalogApi.updateNalog(editing.id, update));
      } catch (err) {
        if (err instanceof NalogApiError) {
          setFieldErrors(err.fieldErrors);
          setFormError(err.message);
        } else {
          setFormError(t('nalogForm_unexpected'));
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const request: CreateNalogRequest = {
      customerId: customer ? customer.id : null,
      newCustomer: customer ? null : {
        fullName, phone, address,
        city: city || null,
        locationNotes: locationNotes || null,
      },
      appliance: { type: applianceType, brand, model: model || null, serialNumber: serialNumber || null },
      diagnosis,
      laborHours,                                      // a string, never parsed to a float
      price: priceValue || null,
      paymentType,
      status: isAdmin ? initialStatus : 'DRAFT',
      // Date only: sent as local noon so the calendar day cannot flip on a timezone conversion.
      scheduledAt: scheduledAt ? new Date(`${scheduledAt}T12:00:00`).toISOString() : null,
      assignedToId: isAdmin && assignedTo ? Number(assignedTo) : null,
    };

    setSubmitting(true);
    try {
      const created = await nalogApi.submitNalog(request, idempotencyKey.current);
      idempotencyKey.current = nalogApi.newIdempotencyKey();     // next form => next key
      onCreated?.(created);
    } catch (err) {
      if (err instanceof NalogApiError) {
        setFieldErrors(err.fieldErrors);
        setFormError(err.message);
      } else {
        setFormError(t('nalogForm_unexpected'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const fe = (k: string) => fieldErrors[k];

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 760 }}>
      {editing && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--stone)' }}>
          {t('nalogEdit_note')}
        </div>
      )}
      {/* ---------- customer ---------- */}
      <Section title={t('nalogForm_customer')}>
        {customer ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{customer.fullName}</div>
              <div style={{ fontSize: 13, color: 'var(--stone)' }}>
                {customer.address}{customer.city ? `, ${customer.city}` : ''} · {customer.phone}
              </div>
            </div>
            <button type="button" className="btn-secondary btn-sm" onClick={() => {
              if (editing) {                      // start the "new customer" form from the current details, to fix a typo
                setFullName(customer.fullName); setPhone(customer.phone); setAddress(customer.address);
                setCity(customer.city ?? ''); setLocationNotes(customer.locationNotes ?? '');
              }
              setCustomer(null); setCustomerQuery('');
            }}>
              {t('nalogForm_changeCustomer')}
            </button>
          </div>
        ) : (
          <>
            <div className="field" style={{ position: 'relative' }}>
              <input className="input" placeholder={t('nalogForm_searchCustomer')} value={customerQuery}
                     onChange={(e) => setCustomerQuery(e.target.value)} />
              {customerResults.length > 0 && (
                <div className="card" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, top: '100%', marginTop: 2, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
                  {customerResults.map((c) => (
                    <button key={c.id} type="button"
                            onClick={() => { setCustomer(c); setCustomerResults([]); }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                      <strong>{c.fullName}</strong>
                      <span style={{ color: 'var(--stone)', fontSize: 12.5 }}> · {c.phone} · {c.address}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--stone)', margin: '4px 0 10px' }}>{t('nalogForm_newCustomer')}</div>
            <div style={grid2}>
              <Field label={t('nalogForm_fullName')} error={fe('newCustomer.fullName')}>
                <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </Field>
              <Field label={t('nalogForm_phone')} error={fe('newCustomer.phone')}>
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </Field>
              <Field label={t('nalogForm_address')} error={fe('newCustomer.address')}>
                <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} required />
              </Field>
              <Field label={t('nalogForm_city')}>
                <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
            </div>
            <Field label={t('nalogForm_locationNotes')}>
              <input className="input" value={locationNotes} onChange={(e) => setLocationNotes(e.target.value)} />
            </Field>
          </>
        )}
      </Section>

      {/* ---------- appliance + issue ---------- */}
      <Section title={t('nalogForm_appliance')} action={isAdmin && (
        <button type="button" className="btn-secondary btn-sm" onClick={() => setNewTypeOpen(true)}>{t('nalogForm_addDevice')}</button>
      )}>
        <div style={grid2}>
          <Field label={t('nalogForm_type')}>
            <select className="input" value={applianceType} onChange={(e) => setApplianceType(e.target.value)}>
              {/* a nalog that still carries the old "Ostalo" keeps showing it, but it is not offered for new ones */}
              {!applianceTypes.includes(applianceType) && <option value={applianceType}>{applianceLabel(t, applianceType)}</option>}
              {applianceTypes.map((a) => <option key={a} value={a}>{applianceLabel(t, a)}</option>)}
            </select>
          </Field>
          <Field label={t('nalogForm_brand')} error={fe('appliance.brand')}>
            <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} required />
          </Field>
          <Field label={t('nalogForm_model')}>
            <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
          </Field>
          <Field label={t('nalogForm_serial')}>
            <input className="input" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
          </Field>
        </div>
        <Field label={t('nalogForm_diagnosis')} error={fe('diagnosis')}>
          <textarea className="input" rows={4} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} required />
        </Field>
      </Section>

      {/* ---------- price ---------- */}
      <Section title={t('nalogForm_priceSection')}>
        <div style={{ maxWidth: 220 }}>
          <Field label={t('nalogForm_price')} error={fe('price')}>
            <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          </Field>
        </div>
      </Section>

      {/* ---------- payment / dispatch ---------- */}
      <Section title={t('nalogForm_payment')}>
        <div style={grid2}>
          <Field label={t('nalogForm_payment')}>
            <select className="input" value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)}>
              {PAYMENT_TYPES.map((p) => <option key={p} value={p}>{t(`payment_${p}`)}</option>)}
            </select>
          </Field>
          {!editing && (
            <Field label={t('nalogForm_scheduledAt')} error={fe('scheduledAt')}>
              <input className="input" type="date" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </Field>
          )}
          {isAdmin && !editing && (
            <>
              <Field label={t('nalogForm_assignTo')}>
                <select className="input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                  <option value="">{t('nalogForm_unassigned')}</option>
                  {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
                </select>
              </Field>
              <Field label={t('nalogForm_initialStatus')}>
                <select className="input" value={initialStatus} onChange={(e) => setInitialStatus(e.target.value as 'DRAFT' | 'DISPATCHED')}>
                  <option value="DRAFT">{t('nalogStatus_DRAFT')}</option>
                  <option value="DISPATCHED">{t('nalogStatus_DISPATCHED')}</option>
                </select>
              </Field>
            </>
          )}
        </div>
        {technicianError && (
          <div role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>
            {`Unable to refresh technician list: ${technicianError}`}
          </div>
        )}
      </Section>

      {formError && (
        <div role="alert" style={{ background: '#FBEAE5', color: 'var(--danger)', padding: '10px 14px', borderRadius: 4, marginBottom: 16, fontSize: 13 }}>
          {formError}
        </div>
      )}
      <button type="submit" className="btn" disabled={submitting}>
        {submitting ? t('nalogForm_saving') : editing ? t('nalogEdit_save') : t('nalogForm_submit')}
      </button>

      {newTypeOpen && (
        <NewDeviceModal
          onClose={() => setNewTypeOpen(false)}
          onAdded={(list, name) => { setApplianceTypes(list); setApplianceType(name); setNewTypeOpen(false); }}
        />
      )}
    </form>
  );
}

/** Built-in types have a translated label; the ones an admin added are shown by their own name. */
export function applianceLabel(t: (key: string) => string, type: string): string {
  return (APPLIANCE_TYPES as readonly string[]).includes(type) ? t(`appliance_${type}`) : type;
}

/** "Dodaj novi uredjaj": admin-level adds a device type; it appears in the dropdown at once and is selected. */
function NewDeviceModal({ onClose, onAdded }: { onClose: () => void; onAdded: (list: string[], name: string) => void }) {
  const { t } = useLang();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function add() {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean || busy) { if (!clean) setError(t('nalogForm_deviceNameRequired')); return; }
    setBusy(true); setError('');
    try {
      const list = await nalogApi.addApplianceType(clean);
      onAdded(list, list.find((x) => x.toLowerCase() === clean.toLowerCase()) ?? clean);
    } catch (e) {
      setError(e instanceof NalogApiError ? e.message : t('nalogForm_unexpected'));
      setBusy(false);
    }
  }

  // A modal inside the nalog <form>: the field must not submit the whole nalog on Enter.
  return (
    <Modal title={t('nalogForm_addDevice')} onClose={onClose}>
      <div className="field">
        <label>{t('nalogForm_deviceName')}</label>
        <input className="input" autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
      </div>
      {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>{t('common_cancel')}</button>
        <button type="button" className="btn" onClick={add} disabled={busy}>{t('nalogForm_deviceAdd')}</button>
      </div>
    </Modal>
  );
}
