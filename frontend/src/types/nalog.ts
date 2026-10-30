// ============================================================================
// RULE C: exact mirror of the Java DTOs.
//   CreateNalogRequest.java  ->  CreateNalogRequest
//   NalogResponse.java       ->  NalogResponse
//   GlobalExceptionHandler   ->  ApiProblem
// Change a Java record => change it here => the compiler lists every broken form.
// ============================================================================

/** Money/decimal values travel as STRINGS ("1250.00"). Never parseFloat() them for math. */
export type DecimalString = string;

// --- enums (string unions; names must match the Java enums + DB CHECKs) ---

export const NALOG_STATUSES = [
  'DRAFT', 'DISPATCHED', 'IN_PROGRESS', 'AWAITING_PARTS', 'COMPLETED', 'CANCELLED',
] as const;
export type NalogStatus = (typeof NALOG_STATUSES)[number];

export const PAYMENT_TYPES = ['CASH', 'CARD', 'INVOICE'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const APPLIANCE_TYPES = [
  'AIR_CONDITIONER', 'REFRIGERATOR', 'FREEZER', 'WASHING_MACHINE', 'DRYER',
  'DISHWASHER', 'OVEN', 'STOVE', 'WATER_HEATER', 'BOILER', 'OTHER',
] as const;
export type ApplianceType = (typeof APPLIANCE_TYPES)[number];

// --- request (what the form may send: NO prices, rates, VAT or totals) ---

export interface CustomerInput {
  fullName: string;
  address: string;
  city?: string | null;
  phone: string;
  email?: string | null;
  locationNotes?: string | null;
}

export interface ApplianceInput {
  type: ApplianceType;
  brand: string;
  model?: string | null;
  serialNumber?: string | null;
}

export interface PartLineInput {
  partId: number;
  quantity: number; // integer 1..999
}

/** Exactly one of customerId / newCustomer must be set. */
export interface CreateNalogRequest {
  customerId?: number | null;
  newCustomer?: CustomerInput | null;
  appliance: ApplianceInput;
  diagnosis: string;
  partLines: PartLineInput[];
  laborHours: DecimalString; // "1.50", max 2 decimals
  paymentType: PaymentType;
  status?: Extract<NalogStatus, 'DRAFT' | 'DISPATCHED'> | null;
  scheduledAt?: string | null; // ISO-8601 instant, UTC
  assignedToId?: number | null; // admin only; technicians are always assigned to themselves
}

// --- response (display only; every number is computed by the Java backend) ---

export interface CustomerView {
  id: number;
  fullName: string;
  address: string;
  city: string | null;
  phone: string;
  email: string | null;
  locationNotes: string | null;
}

export interface ApplianceView {
  type: ApplianceType;
  brand: string;
  model: string | null;
  serialNumber: string | null;
}

export interface PartLineView {
  partId: number;
  sku: string;
  name: string;
  unitPrice: DecimalString;
  quantity: number;
  lineTotal: DecimalString;
}

export interface NalogResponse {
  id: number;
  nalogNumber: string;
  status: NalogStatus;
  customer: CustomerView;
  appliance: ApplianceView;
  diagnosis: string;
  laborHours: DecimalString;
  laborRate: DecimalString;
  laborTotal: DecimalString;
  partLines: PartLineView[];
  partsTotal: DecimalString;
  subtotal: DecimalString;
  vatRate: DecimalString; // "0.2000" = 20%
  vatAmount: DecimalString;
  total: DecimalString;
  paymentType: PaymentType;
  createdByName: string | null;
  assignedToId: number | null;
  assignedToName: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  createdAt: string; // ISO-8601 instant
  updatedAt: string;
}

// --- error contract (RFC 7807 ProblemDetail from GlobalExceptionHandler) ---

export interface ApiProblem {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  instance?: string;
  /** Present on 400 validation failures: { "appliance.brand": "must not be blank" } */
  errors?: Record<string, string>;
}

// --- Phase 2 contract --------------------------------------------------------

/** Row of the list view (GET /api/nalozi). */
export interface NalogSummary {
  id: number;
  nalogNumber: string;
  status: NalogStatus;
  customerName: string;
  customerPhone: string;
  applianceType: ApplianceType;
  applianceBrand: string;
  total: DecimalString;
  paymentType: PaymentType;
  assignedToName: string | null;
  createdAt: string;
}

export interface PageResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

export interface NalogListQuery {
  status?: NalogStatus;
  q?: string;
  assignedTo?: number; // admin only; technicians are scoped by the server
  page?: number;
  size?: number;
}

/** PATCH /api/nalozi/{id}/status */
export interface ChangeStatusRequest {
  status: NalogStatus;
}

export interface StatusHistoryView {
  fromStatus: NalogStatus | null;
  toStatus: NalogStatus;
  changedByName: string | null;
  changedAt: string;
}

/** POST /api/nalozi/preview - "what would this cost?", answered by the backend. */
export interface PreviewRequest {
  partLines: PartLineInput[];
  laborHours: DecimalString;
}

export interface NalogPreview {
  laborHours: DecimalString;
  laborRate: DecimalString;
  laborTotal: DecimalString;
  partLines: PartLineView[];
  partsTotal: DecimalString;
  subtotal: DecimalString;
  vatRate: DecimalString;
  vatAmount: DecimalString;
  total: DecimalString;
}

// --- inventory (PartDtos.java) ---

export interface PartResponse {
  id: number;
  sku: string;
  name: string;
  unitPrice: DecimalString;
  stockQty: number;
  active: boolean;
}

export interface CreatePartRequest {
  sku: string;
  name: string;
  unitPrice: DecimalString;
  stockQty: number;
}

export interface UpdatePartRequest {
  name: string;
  unitPrice: DecimalString;
  active: boolean;
}

export interface StockAdjustRequest {
  delta: number; // may be negative; server rejects results below 0
  note?: string | null;
}

/**
 * UI HINT ONLY (to grey out buttons). The server enforces the real rules
 * (NalogStatusRules.java) and answers 409 on an illegal move; cancel is admin-only.
 */
export const NEXT_STATUSES: Record<NalogStatus, readonly NalogStatus[]> = {
  DRAFT: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['AWAITING_PARTS', 'COMPLETED', 'CANCELLED'],
  AWAITING_PARTS: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** PATCH /api/nalozi/{id}/assign (admin). technicianId: null un-assigns. */
export interface AssignRequest {
  technicianId: number | null;
}

/** GET /api/nalozi/technicians (admin) - for the "assign to" dropdown. */
export interface TechnicianView {
  id: number;
  name: string;
}

export type PhotoCategory = 'before' | 'after' | 'label' | 'other';

/** Mirrors PhotoView.java. Metadata only; the image bytes are fetched with the auth header (see nalogApi.fetchPhotoBlob). */
export interface PhotoView {
  id: number;
  nalogId: number;
  category: PhotoCategory;
  caption: string | null;
  originalName: string | null;
  contentType: string;
  sizeBytes: number;
  uploadedById: number | null;
  uploadedByName: string | null;
  createdAt: string;
}
