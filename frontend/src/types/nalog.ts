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
  'DRAFT', 'DISPATCHED', 'IN_PROGRESS', 'AWAITING_PARTS', 'RECEIVED', 'TESTING', 'DRIVING', 'NEEDS_ELECTRICIAN',
  'COMPLETED', 'CANCELLED',
] as const;
export type NalogStatus = (typeof NALOG_STATUSES)[number];

export const PAYMENT_TYPES = ['CASH', 'CARD', 'INVOICE'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

/** The built-in device types (codes). Admin-level users can add more at any time (GET/POST /api/appliance-types), so the type is a plain string. */
export const APPLIANCE_TYPES = [
  'AIR_CONDITIONER', 'REFRIGERATOR', 'FREEZER', 'WASHING_MACHINE', 'DRYER',
  'DISHWASHER', 'OVEN', 'STOVE', 'WATER_HEATER', 'BOILER', 'OTHER',
] as const;
export type ApplianceType = string;

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

/** Exactly one of customerId / newCustomer must be set. */
export interface CreateNalogRequest {
  customerId?: number | null;
  newCustomer?: CustomerInput | null;
  appliance: ApplianceInput;
  diagnosis: string;
  laborHours: DecimalString; // "1.50", max 2 decimals
  price?: DecimalString | null; // typed by hand, net total; blank = 0.00 (on edit: unchanged)
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

/** Mirrors CustomerDtos.CustomerNalog (one line of a customer's history). */
export interface CustomerNalog {
  id: number;
  nalogNumber: string;
  status: NalogStatus;
  createdAt: string; // ISO instant
  applianceType: ApplianceType | null;
  applianceBrand: string | null;
  applianceModel: string | null;
  total: DecimalString;
}

/** Mirrors CustomerDtos.CustomerDetail (GET /api/customers/{id}). Create and edit send a CustomerInput. */
export interface CustomerDetail {
  customer: CustomerView;
  nalozi: CustomerNalog[];
}

export interface ApplianceView {
  type: ApplianceType;
  brand: string;
  model: string | null;
  serialNumber: string | null;
}

/** Old nalozi may still carry part lines from before parts were removed from the nalog; nothing new is added. */
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
  /** Why the nalog was cancelled; set only on CANCELLED nalozi. */
  cancelReason: string | null;
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
  /** Send back as expectedVersion when editing; the server refuses the save if someone changed the nalog meanwhile. */
  version: number;
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
  from?: string; // ISO instant, nalozi created at or after
  to?: string;   // ISO instant, nalozi created before
  page?: number;
  size?: number;
  archive?: boolean; // technician: the nalozi that were taken away from him (read-only)
}

/** PATCH /api/nalozi/{id}/status */
export interface ChangeStatusRequest {
  status: NalogStatus;
  reason?: string | null; // required when status is CANCELLED
}

export interface StatusHistoryView {
  fromStatus: NalogStatus | null;
  toStatus: NalogStatus;
  changedByName: string | null;
  changedAt: string;
}

/** POST /api/nalozi/preview - "what would this cost?", answered by the backend. */
export interface PreviewRequest {
  laborHours: DecimalString;
  price?: DecimalString | null;
  /** When editing: price against this nalog (its own rates). */
  nalogId?: number | null;
}

export interface NalogPreview {
  laborHours: DecimalString;
  laborRate: DecimalString;
  laborTotal: DecimalString;
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
  active: boolean;
  unit: string;
}

export interface CreatePartRequest {
  sku: string;
  name: string;
  unit?: string | null; // blank = "kom"
}

export interface UpdatePartRequest {
  name: string;
  active: boolean;
  unit?: string | null; // omitted = unchanged
}

/** POST /api/parts/import: CSV text (sifra;naziv;jedinica mere) as the request body. */
export interface ImportResult {
  created: number;
  updated: number;
  skipped: string[];
}

/**
 * UI HINT ONLY (to grey out buttons). The server enforces the real rules
 * (NalogStatusRules.java) and answers 409 on an illegal move; cancelling needs a written reason and is final.
 */
export const NEXT_STATUSES: Record<NalogStatus, readonly NalogStatus[]> = {
  DRAFT: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['IN_PROGRESS', 'AWAITING_PARTS', 'RECEIVED', 'TESTING', 'DRIVING', 'NEEDS_ELECTRICIAN', 'CANCELLED'],
  IN_PROGRESS: ['AWAITING_PARTS', 'RECEIVED', 'TESTING', 'DRIVING', 'NEEDS_ELECTRICIAN', 'COMPLETED', 'CANCELLED'],
  AWAITING_PARTS: ['IN_PROGRESS', 'RECEIVED', 'TESTING', 'DRIVING', 'NEEDS_ELECTRICIAN', 'COMPLETED', 'CANCELLED'],
  RECEIVED: ['IN_PROGRESS', 'AWAITING_PARTS', 'TESTING', 'DRIVING', 'NEEDS_ELECTRICIAN', 'COMPLETED', 'CANCELLED'],
  TESTING: ['IN_PROGRESS', 'AWAITING_PARTS', 'RECEIVED', 'DRIVING', 'NEEDS_ELECTRICIAN', 'COMPLETED', 'CANCELLED'],
  DRIVING: ['IN_PROGRESS', 'AWAITING_PARTS', 'RECEIVED', 'TESTING', 'NEEDS_ELECTRICIAN', 'COMPLETED', 'CANCELLED'],
  NEEDS_ELECTRICIAN: ['IN_PROGRESS', 'AWAITING_PARTS', 'RECEIVED', 'TESTING', 'DRIVING', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * PUT /api/nalozi/{id} (UpdateNalogRequest.java). No money in here either. Status, visit time and assignment are
 * NOT part of an edit; they have their own endpoints.
 */
export interface UpdateNalogRequest {
  customerId?: number | null;
  newCustomer?: CustomerInput | null;
  appliance: ApplianceInput;
  diagnosis: string;
  laborHours: DecimalString;
  price?: DecimalString | null;
  paymentType: PaymentType;
  expectedVersion: number;
}

/** Statuses that can still be edited (everything except the finished COMPLETED and the CANCELLED ones). */
export const EDITABLE_STATUSES: readonly NalogStatus[] = [
  'DRAFT', 'DISPATCHED', 'IN_PROGRESS', 'AWAITING_PARTS', 'RECEIVED', 'TESTING', 'DRIVING', 'NEEDS_ELECTRICIAN',
];

/** PATCH /api/nalozi/{id}/assign (admin). technicianId: null un-assigns. */
export interface AssignRequest {
  technicianId: number | null;
}

/** GET /api/nalozi/technicians (admin) - for the "assign to" dropdown. */
export interface TechnicianView {
  id: number;
  name: string;
}

/** Mirrors StockDocDtos.java: Zaduzenje (ZAD) / Razduzenje (RAZ) documents. Quantities are strings ("2.000"). */
export type StockDocType = 'ZAD' | 'RAZ';

export interface StockLineRequest {
  partId: number;
  quantity: DecimalString;
}

export interface CreateStockDocRequest {
  type: StockDocType;
  technicianId: number;
  docAt?: string | null; // ISO instant, blank = now
  lines: StockLineRequest[];
}

export interface UpdateStockDocRequest {
  technicianId: number;
  docAt: string;
  lines: StockLineRequest[];
}

export interface StockLineView {
  id: number;
  partId: number | null;
  sku: string | null;
  name: string;
  unit: string;
  quantity: DecimalString;
}

export interface StockDocSummary {
  id: number;
  type: StockDocType;
  docNo: number;
  technicianId: number;
  technicianName: string;
  docAt: string;
  createdByName: string;
  lineCount: number;
  nalogId: number | null;
  nalogNumber: string | null;
}

export interface StockDocView {
  id: number;
  type: StockDocType;
  docNo: number;
  technicianId: number;
  technicianName: string;
  docAt: string;
  createdByName: string;
  updatedByName: string | null;
  lines: StockLineView[];
  nalogId: number | null;
  nalogNumber: string | null;
}

export interface StockRevisionView {
  revisedAt: string;
  revisedByName: string;
  snapshot: string;
}

/** One technician + one part over a period: opening + issued - returned = closing. */
export interface BalanceRow {
  technicianId: number;
  technicianName: string;
  partId: number | null;
  sku: string | null;
  name: string;
  unit: string;
  opening: DecimalString;
  issued: DecimalString;
  returned: DecimalString;
  closing: DecimalString;
}

export interface StockDocQuery {
  type?: StockDocType;
  technicianId?: number;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

export type PhotoCategory = 'before' | 'after' | 'label' | 'workorder' | 'other';

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

/** NoteDtos.NoteView - append-only notes on a nalog. */
export interface NoteView {
  id: number;
  nalogId: number;
  authorId: number | null;
  authorName: string;
  body: string;
  createdAt: string; // ISO instant
}

export interface CreateNoteRequest {
  body: string; // 1..2000 characters
}

/** Mirrors NalogStats.java (GET /api/nalozi/stats). Hours are strings. */
export interface NalogStats {
  open: number;
  unassigned: number;
  awaitingParts: number;
  completedThisWeek: number;
  byStatus: Array<{ status: NalogStatus; count: number }>;
  openByTechnician: Array<{ name: string; count: number }>;
  hoursByTechnician: Array<{ name: string; totalHours: string; hoursThisWeek: string }>;
}

/** Mirrors CalendarEntry.java (GET /api/nalozi/calendar). */
export interface CalendarEntry {
  id: number;
  nalogNumber: string;
  status: NalogStatus;
  scheduledAt: string;
  customerName: string;
  applianceType: string | null;
  assignedToName: string | null;
}

/** Mirrors ReportSummary.java (GET /api/nalozi/reports/summary, admin only). All decimals are strings. */
export interface ReportTotals {
  count: number;
  laborHours: DecimalString;
  laborTotal: DecimalString;
  partsTotal: DecimalString;
  subtotal: DecimalString;
  vatAmount: DecimalString;
  total: DecimalString;
}
export interface ReportRow { key: string; totals: ReportTotals }
export interface ReportSummary {
  from: string;
  to: string;
  totals: ReportTotals;
  byTechnician: ReportRow[];
  byMonth: ReportRow[];
  byPayment: ReportRow[];
}

/** Mirrors BulkDtos.java. */
export interface BulkResult { processed: number }
export interface BulkCustomerDelete {
  deleted: number;
  skipped: Array<{ id: number; fullName: string; reason: 'HAS_NALOZI' | 'NOT_FOUND' }>;
}

/** Mirrors CountsReport.java (GET /api/nalozi/reports/counts, owner only): nalozi per worker and status. */
export interface CountsRow { technician: string; byStatus: Record<string, number>; total: number }
export interface CountsReport { from: string; to: string; rows: CountsRow[]; totals: CountsRow }

/** Mirrors NalogEventView.java: one line of a nalog's complete history (kind: STATUS, CREATED, ASSIGN, EDIT, NOTE, PHOTO, MATERIAL, SCHEDULE, CANCEL). */
export interface NalogEventView {
  at: string;
  by: string | null;
  kind: string;
  detail: string | null;
}

/** A part a technician holds. Deliberately no quantity. */
export interface HeldPart {
  partId: number;
  sku: string | null;
  name: string;
  unit: string;
}

/** Material used on a nalog = a line of the automatic Razduzenje. */
export interface MaterialLine {
  lineId: number;
  docId: number;
  docNo: number;
  partId: number | null;
  sku: string | null;
  name: string;
  unit: string;
  quantity: DecimalString;
  byName: string;
  at: string;
}
