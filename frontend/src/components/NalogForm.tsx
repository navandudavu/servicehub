import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { nalogApi } from '../api/nalog';
import { NalogApiError } from '../api/nalogApi';
import { formatMoney } from '../print/formatMoney';
import { useLang } from '../i18n/typedLang';
import {
  APPLIANCE_TYPES, PAYMENT_TYPES,
  type ApplianceType, type CreateNalogRequest, type CustomerView, type NalogPreview, type NalogResponse,
  type PartResponse, type PaymentType, type TechnicianView,
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
  onCreated: (nalog: NalogResponse) => void;
}

interface SelectedPart {
  part: PartResponse;
  quantity: number;
}

const LABOR_HOURS_RE = /^\d{1,3}(\.\d{1,2})?$/;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 14 }}>
        {title}
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

export function NalogForm({ isAdmin, onCreated }: Props) {
  const { t } = useLang();

  // --- customer ---
  const [customer, setCustomer] = useState<CustomerView | null>(null);   // picked existing customer
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerView[]>([]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [locationNotes, setLocationNotes] = useState('');

  // --- appliance / issue ---
  const [applianceType, setApplianceType] = useState<ApplianceType>('AIR_CONDITIONER');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [diagnosis, setDiagnosis] = useState('');

  // --- parts & labor ---
  const [partQuery, setPartQuery] = useState('');
  const [partResults, setPartResults] = useState<PartResponse[]>([]);
  const [selected, setSelected] = useState<SelectedPart[]>([]);
  const [laborHours, setLaborHours] = useState('0.00');

  // --- misc ---
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [initialStatus, setInitialStatus] = useState<'DRAFT' | 'DISPATCHED'>('DRAFT');
  const [scheduledAt, setScheduledAt] = useState('');          // datetime-local (browser local time)
  const [technicians, setTechnicians] = useState<TechnicianView[]>([]);
  const [assignedTo, setAssignedTo] = useState('');

  // --- backend-computed preview + submit state ---
  const [preview, setPreview] = useState<NalogPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // One key per form instance: double-clicks and retries after a timeout reuse it,
  // so the server can never create two nalozi from one submit.
  const idempotencyKey = useRef(nalogApi.newIdempotencyKey());

  // Admin: who can it be assigned to?
  useEffect(() => {
    if (!isAdmin) return;
    const ctrl = new AbortController();
    nalogApi.listTechnicians(ctrl.signal).then(setTechnicians).catch(() => { /* dropdown stays empty */ });
    return () => ctrl.abort();
  }, [isAdmin]);

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

  // Debounced inventory lookup.
  useEffect(() => {
    if (partQuery.trim().length < 2) { setPartResults([]); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      nalogApi.searchParts(partQuery.trim(), { size: 8 }, ctrl.signal)
        .then((page) => setPartResults(page.items))
        .catch(() => { /* next keystroke retries */ });
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [partQuery]);

  // Debounced price preview: the BACKEND does the maths.
  useEffect(() => {
    if (!LABOR_HOURS_RE.test(laborHours)) { setPreview(null); return; }
    const ctrl = new AbortController();
    setPreviewBusy(true);
    const timer = setTimeout(() => {
      nalogApi.previewNalog(
        { laborHours, partLines: selected.map((s) => ({ partId: s.part.id, quantity: s.quantity })) },
        ctrl.signal,
      )
        .then((p) => { setPreview(p); setPreviewError(null); })
        .catch((e) => {
          if (e instanceof NalogApiError && e.message !== 'Request cancelled') {
            setPreview(null);
            setPreviewError(e.message);               // e.g. "Not enough stock for ..."
          }
        })
        .finally(() => setPreviewBusy(false));
    }, 400);
    return () => { clearTimeout(timer); ctrl.abort(); setPreviewBusy(false); };
  }, [laborHours, selected]);

  function addPart(part: PartResponse) {
    setSelected((cur) => cur.some((s) => s.part.id === part.id)
      ? cur.map((s) => s.part.id === part.id ? { ...s, quantity: Math.min(s.quantity + 1, 999) } : s)
      : [...cur, { part, quantity: 1 }]);
    setPartQuery('');
    setPartResults([]);
  }

  function setQuantity(partId: number, quantity: number) {
    setSelected((cur) => cur.map((s) => s.part.id === partId
      ? { ...s, quantity: Math.max(1, Math.min(999, Math.floor(quantity) || 1)) } : s));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;                           // guard against double submit
    setFormError(null);
    setFieldErrors({});

    if (!LABOR_HOURS_RE.test(laborHours)) {
      setFieldErrors({ laborHours: t('nalogForm_hoursInvalid') });
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
      partLines: selected.map((s) => ({ partId: s.part.id, quantity: s.quantity })),
      laborHours,                                      // a string, never parsed to a float
      paymentType,
      status: isAdmin ? initialStatus : 'DRAFT',
      // datetime-local is browser-local time; toISOString() converts it to the correct UTC instant.
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      assignedToId: isAdmin && assignedTo ? Number(assignedTo) : null,
    };

    setSubmitting(true);
    try {
      const created = await nalogApi.submitNalog(request, idempotencyKey.current);
      idempotencyKey.current = nalogApi.newIdempotencyKey();     // next form => next key
      onCreated(created);
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
            <button type="button" className="btn-secondary btn-sm" onClick={() => { setCustomer(null); setCustomerQuery(''); }}>
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
      <Section title={t('nalogForm_appliance')}>
        <div style={grid2}>
          <Field label={t('nalogForm_type')}>
            <select className="input" value={applianceType} onChange={(e) => setApplianceType(e.target.value as ApplianceType)}>
              {APPLIANCE_TYPES.map((a) => <option key={a} value={a}>{t(`appliance_${a}`)}</option>)}
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

      {/* ---------- parts & labor ---------- */}
      <Section title={t('nalogForm_partsLabor')}>
        <div className="field" style={{ position: 'relative' }}>
          <input className="input" placeholder={t('nalogForm_searchParts')} value={partQuery} onChange={(e) => setPartQuery(e.target.value)} />
          {partResults.length > 0 && (
            <div className="card" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, top: '100%', marginTop: 2, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
              {partResults.map((p) => (
                <button key={p.id} type="button" disabled={p.stockQty < 1} onClick={() => addPart(p)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 12px', borderBottom: '1px solid var(--border)', opacity: p.stockQty < 1 ? 0.45 : 1 }}>
                  <strong>{p.name}</strong>
                  <span style={{ color: 'var(--stone)', fontSize: 12.5 }}> · {p.sku} · {formatMoney(p.unitPrice)} · {p.stockQty} {t('nalogForm_stockLabel')}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selected.map((s) => (
          <div key={s.part.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              {s.part.name} <span style={{ color: 'var(--stone)', fontSize: 12.5 }}>({s.part.sku})</span>
            </div>
            <input className="input" type="number" min={1} max={999} value={s.quantity} style={{ width: 80 }}
                   onChange={(e) => setQuantity(s.part.id, Number(e.target.value))} />
            <button type="button" className="btn-secondary btn-xs"
                    onClick={() => setSelected((c) => c.filter((x) => x.part.id !== s.part.id))}>
              {t('nalogForm_remove')}
            </button>
          </div>
        ))}

        <div style={{ marginTop: 14, maxWidth: 220 }}>
          <Field label={t('nalogForm_laborHours')} error={fe('laborHours')}>
            <input className="input" inputMode="decimal" value={laborHours} onChange={(e) => setLaborHours(e.target.value)} />
          </Field>
        </div>

        {/* DISPLAY of numbers computed by the Java backend. */}
        <div aria-live="polite" style={{ marginTop: 6 }}>
          {previewError && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{previewError}</div>}
          {previewBusy && !preview && <div style={{ color: 'var(--stone)', fontSize: 13 }}>{t('nalogForm_calculating')}</div>}
          {preview && (
            <table style={{ width: '100%', maxWidth: 380, borderCollapse: 'collapse', fontSize: 13.5, opacity: previewBusy ? 0.5 : 1 }}>
              <tbody>
                <tr><td>{t('nalogForm_labor')} ({preview.laborHours} h × {formatMoney(preview.laborRate)})</td><td style={{ textAlign: 'right' }}>{formatMoney(preview.laborTotal)}</td></tr>
                {preview.partLines.map((l) => (
                  <tr key={l.partId}><td>{l.name} × {l.quantity}</td><td style={{ textAlign: 'right' }}>{formatMoney(l.lineTotal)}</td></tr>
                ))}
                <tr><td style={{ paddingTop: 6 }}>{t('nalogForm_subtotal')}</td><td style={{ textAlign: 'right', paddingTop: 6 }}>{formatMoney(preview.subtotal)}</td></tr>
                <tr><td>{t('nalogForm_vat')}</td><td style={{ textAlign: 'right' }}>{formatMoney(preview.vatAmount)}</td></tr>
                <tr style={{ fontWeight: 700, fontSize: 15 }}>
                  <td style={{ borderTop: '2px solid var(--ink)', paddingTop: 4 }}>{t('nalogForm_total')}</td>
                  <td style={{ borderTop: '2px solid var(--ink)', paddingTop: 4, textAlign: 'right' }}>{formatMoney(preview.total)} RSD</td>
                </tr>
              </tbody>
            </table>
          )}
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
          <Field label={t('nalogForm_scheduledAt')} error={fe('scheduledAt')}>
            <input className="input" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </Field>
          {isAdmin && (
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
      </Section>

      {formError && (
        <div role="alert" style={{ background: '#FBEAE5', color: 'var(--danger)', padding: '10px 14px', borderRadius: 4, marginBottom: 16, fontSize: 13 }}>
          {formError}
        </div>
      )}
      <button type="submit" className="btn" disabled={submitting}>
        {submitting ? t('nalogForm_saving') : t('nalogForm_submit')}
      </button>
    </form>
  );
}
