import axios, { AxiosError, AxiosInstance, Method } from 'axios';
import type {
  ApiProblem, CarriedRequest, CarriedView, CreateNalogRequest, CustomerDetail, CustomerInput, CustomerView, CreatePartRequest, NalogListQuery, NalogPreview, NalogResponse,
  NalogStatus, NalogSummary, PageResponse, PartResponse, PreviewRequest, StatusHistoryView,
  StockAdjustRequest, StockMovementView, NoteView, CreateNoteRequest, UpdateNalogRequest, TechnicianView, UpdatePartRequest, PhotoView, PhotoCategory, NalogStats, CalendarEntry, ReportSummary, BulkResult, BulkCustomerDelete,
} from '../types/nalog';

/** Normalised error: the UI never has to look inside an AxiosError. */
export class NalogApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,   // null = never reached the server
    public readonly fieldErrors: Record<string, string> = {},
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'NalogApiError';
  }
}

export interface NalogClientOptions {
  baseURL: string;
  /** The ServiceHub login token as 'Bearer <jwt>'. The Java service accepts the same JWT as the Node API. */
  getAuthorization: () => string | null;
  /** Called on 401 so the app can send the user back to login. */
  onUnauthorized?: () => void;
}

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 15_000;

export function createNalogClient({ baseURL, getAuthorization, onUnauthorized }: NalogClientOptions) {
  const http: AxiosInstance = axios.create({ baseURL, timeout: REQUEST_TIMEOUT_MS });

  /**
   * One place that sends every request.
   *
   * Stability safeguards:
   *  - Retries ONLY on network errors/timeouts and 502/503/504, never on 4xx.
   *  - Only requests that are safe to repeat are retried: GETs, POST-with-Idempotency-Key,
   *    and PATCH status (the server treats "same status again" as a no-op).
   *    Stock/part POSTs are NEVER retried (a repeat could apply twice).
   *  - Exponential backoff (500ms, 1s).
   *  - Every failure becomes a NalogApiError with per-field messages.
   *  - No money maths here: every number shown comes from the backend.
   */
  async function send<T>(
    method: Method, url: string,
    opts: { data?: unknown; params?: object; headers?: Record<string, string>; safeToRetry: boolean; signal?: AbortSignal;
            timeout?: number; responseType?: 'json' | 'blob' },
  ): Promise<T> {
    let lastError: NalogApiError | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const auth = getAuthorization();
        const res = await http.request<T>({
          method, url, data: opts.data, params: opts.params, signal: opts.signal,
          timeout: opts.timeout, responseType: opts.responseType,
          headers: { ...(auth ? { Authorization: auth } : {}), ...opts.headers },
        });
        return res.data;
      } catch (err) {
        lastError = toNalogApiError(err);
        if (lastError.status === 401) onUnauthorized?.();
        const canRetry = opts.safeToRetry && lastError.retryable && attempt < MAX_ATTEMPTS && !opts.signal?.aborted;
        if (!canRetry) break;
        await sleep(500 * 2 ** (attempt - 1));
      }
    }
    throw lastError!;
  }

  /** Generate ONCE when the form opens; reuse for every retry/resubmit of that form. */
  function newIdempotencyKey(): string {
    return crypto.randomUUID();
  }

  // ---- nalozi ----
  const submitNalog = (request: CreateNalogRequest, idempotencyKey: string, signal?: AbortSignal) =>
    send<NalogResponse>('POST', '/api/nalozi', {
      data: request, headers: { 'Idempotency-Key': idempotencyKey }, safeToRetry: true, signal,
    });

  // Never retried automatically: after a save that succeeded but whose answer got lost, a repeat would be rejected
  // as a stale form, and the user should look at the nalog instead.
  const updateNalog = (id: number, request: UpdateNalogRequest) =>
    send<NalogResponse>('PUT', `/api/nalozi/${id}`, { data: request, safeToRetry: false });

  // Admin only on the server. Never retried.
  const deleteNalog = (id: number) =>
    send<void>('DELETE', `/api/nalozi/${id}`, { safeToRetry: false });

  const previewNalog = (request: PreviewRequest, signal?: AbortSignal) =>
    send<NalogPreview>('POST', '/api/nalozi/preview', { data: request, safeToRetry: true, signal });

  const listNalozi = (query: NalogListQuery = {}, signal?: AbortSignal) =>
    send<PageResponse<NalogSummary>>('GET', '/api/nalozi', { params: query, safeToRetry: true, signal });

  const getNalog = (id: number, signal?: AbortSignal) =>
    send<NalogResponse>('GET', `/api/nalozi/${id}`, { safeToRetry: true, signal });

  const getNalogHistory = (id: number, signal?: AbortSignal) =>
    send<StatusHistoryView[]>('GET', `/api/nalozi/${id}/history`, { safeToRetry: true, signal });

  const changeStatus = (id: number, status: NalogStatus, signal?: AbortSignal) =>
    send<NalogResponse>('PATCH', `/api/nalozi/${id}/status`, { data: { status }, safeToRetry: true, signal });

  const searchCustomers = (q: string, signal?: AbortSignal) =>
    send<CustomerView[]>('GET', '/api/nalozi/customers', { params: { q }, safeToRetry: true, signal });

  // admin only on the server
  const assignNalog = (id: number, technicianId: number | null, signal?: AbortSignal) =>
    send<NalogResponse>('PATCH', `/api/nalozi/${id}/assign`, { data: { technicianId }, safeToRetry: true, signal });

  const listTechnicians = (signal?: AbortSignal) =>
    send<TechnicianView[]>('GET', '/api/nalozi/technicians', { safeToRetry: true, signal });

  // ---- customers page (the same customer table the nalog form uses) ----
  const listCustomers = (q?: string, signal?: AbortSignal) =>
    send<CustomerView[]>('GET', '/api/customers', { params: q ? { q } : {}, safeToRetry: true, signal });

  const getCustomer = (id: number, signal?: AbortSignal) =>
    send<CustomerDetail>('GET', `/api/customers/${id}`, { safeToRetry: true, signal });

  const createCustomer = (body: CustomerInput) =>
    send<CustomerView>('POST', '/api/customers', { data: body, safeToRetry: false });

  const updateCustomer = (id: number, body: CustomerInput) =>
    send<CustomerView>('PUT', `/api/customers/${id}`, { data: body, safeToRetry: true });

  // admin only on the server; 409 when the customer has nalozi
  const deleteCustomer = (id: number) =>
    send<{ ok: boolean }>('DELETE', `/api/customers/${id}`, { safeToRetry: false });

  // ---- bulk actions from the list screens (admin only on the server; max 200 ids) ----
  // Deleting is never retried: a repeat would answer "no longer exists" for rows the first try already removed.
  const bulkDeleteNalozi = (ids: number[]) =>
    send<BulkResult>('POST', '/api/nalozi/bulk-delete', { data: { ids }, safeToRetry: false });
  const bulkAssignNalozi = (ids: number[], technicianId: number | null) =>
    send<BulkResult>('POST', '/api/nalozi/bulk-assign', { data: { ids, technicianId }, safeToRetry: true });
  const bulkSetPartsActive = (ids: number[], active: boolean) =>
    send<BulkResult>('POST', '/api/parts/bulk-active', { data: { ids, active }, safeToRetry: true });
  const bulkDeleteCustomers = (ids: number[]) =>
    send<BulkCustomerDelete>('POST', '/api/customers/bulk-delete', { data: { ids }, safeToRetry: false });

  // ---- dashboard / calendar / schedule ----
  const getStats = (signal?: AbortSignal) =>
    send<NalogStats>('GET', '/api/nalozi/stats', { safeToRetry: true, signal });

  // admin only on the server

  const getCalendar = (fromIso: string, toIso: string, signal?: AbortSignal) =>
    send<CalendarEntry[]>('GET', '/api/nalozi/calendar', { params: { from: fromIso, to: toIso }, safeToRetry: true, signal });

  // admin only on the server; null clears the visit
  const setSchedule = (id: number, scheduledAt: string | null, signal?: AbortSignal) =>
    send<NalogResponse>('PATCH', `/api/nalozi/${id}/schedule`, { data: { scheduledAt }, safeToRetry: true, signal });

  // ---- reports (admin only on the server) ----
  const getReportSummary = (fromIso: string, toIso: string, signal?: AbortSignal) =>
    send<ReportSummary>('GET', '/api/nalozi/reports/summary', { params: { from: fromIso, to: toIso }, safeToRetry: true, signal });

  const fetchReportCsv = (fromIso: string, toIso: string, status?: string) =>
    send<Blob>('GET', '/api/nalozi/reports/export.csv', {
      params: { from: fromIso, to: toIso, ...(status ? { status } : {}) }, safeToRetry: true, responseType: 'blob', timeout: 60_000,
    });

  // ---- photos ----
  const listPhotos = (nalogId: number, signal?: AbortSignal) =>
    send<PhotoView[]>('GET', `/api/nalozi/${nalogId}/photos`, { safeToRetry: true, signal });

  // Never retried automatically: a repeat could store the photo twice.
  const uploadPhoto = (nalogId: number, file: File, category: PhotoCategory, signal?: AbortSignal) => {
    const form = new FormData();
    form.append('photo', file);
    form.append('category', category);
    return send<PhotoView>('POST', `/api/nalozi/${nalogId}/photos`, {
      data: form, safeToRetry: false, timeout: 90_000, signal,
    });
  };

  const deletePhoto = (nalogId: number, photoId: number) =>
    send<void>('DELETE', `/api/nalozi/${nalogId}/photos/${photoId}`, { safeToRetry: false });

  // ---- notes ----
  const listNotes = (nalogId: number, signal?: AbortSignal) =>
    send<NoteView[]>('GET', `/api/nalozi/${nalogId}/notes`, { safeToRetry: true, signal });
  // Never retried automatically: a repeat could save the same note twice.
  const addNote = (nalogId: number, req: CreateNoteRequest) =>
    send<NoteView>('POST', `/api/nalozi/${nalogId}/notes`, { data: req, safeToRetry: false });
  const deleteNote = (nalogId: number, noteId: number) =>
    send<void>('DELETE', `/api/nalozi/${nalogId}/notes/${noteId}`, { safeToRetry: false });

  /** Image bytes need the Authorization header, so a plain <img src> can't be used: fetch as a blob. */
  const fetchPhotoBlob = (nalogId: number, photoId: number, signal?: AbortSignal) =>
    send<Blob>('GET', `/api/nalozi/${nalogId}/photos/${photoId}/file`, { safeToRetry: true, responseType: 'blob', signal });

  // ---- parts / inventory ----
  const searchParts = (q: string, opts: { onlyActive?: boolean; page?: number; size?: number } = {}, signal?: AbortSignal) =>
    send<PageResponse<PartResponse>>('GET', '/api/parts', { params: { q, ...opts }, safeToRetry: true, signal });

  // admin-only on the server
  const listStockMovements = (id: number, signal?: AbortSignal) =>
    send<StockMovementView[]>('GET', `/api/parts/${id}/movements`, { safeToRetry: true, signal });
  const createPart = (req: CreatePartRequest) =>
    send<PartResponse>('POST', '/api/parts', { data: req, safeToRetry: false });
  const updatePart = (id: number, req: UpdatePartRequest) =>
    send<PartResponse>('PUT', `/api/parts/${id}`, { data: req, safeToRetry: true });
  const adjustStock = (id: number, req: StockAdjustRequest) =>
    send<PartResponse>('POST', `/api/parts/${id}/stock`, { data: req, safeToRetry: false });

  // ---- zaduzivanje (what a technician carries) ----
  const listCarried = (technicianId?: number, signal?: AbortSignal) =>
    send<CarriedView[]>('GET', '/api/carried', { params: technicianId == null ? {} : { technicianId }, safeToRetry: true, signal });
  const addCarried = (req: CarriedRequest) =>
    send<CarriedView>('POST', '/api/carried', { data: req, safeToRetry: false });
  const updateCarried = (id: number, req: CarriedRequest) =>
    send<CarriedView>('PUT', `/api/carried/${id}`, { data: req, safeToRetry: true });
  const deleteCarried = (id: number) =>
    send<{ ok: boolean }>('DELETE', `/api/carried/${id}`, { safeToRetry: false });

  return {
    newIdempotencyKey, submitNalog, updateNalog, deleteNalog, previewNalog, listNalozi, getNalog, getNalogHistory, changeStatus,
    searchCustomers, listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer, bulkDeleteNalozi, bulkAssignNalozi, bulkSetPartsActive, bulkDeleteCustomers, assignNalog, listTechnicians, getStats, getCalendar, setSchedule, getReportSummary, fetchReportCsv, listPhotos, uploadPhoto, deletePhoto, fetchPhotoBlob, listNotes, addNote, deleteNote, searchParts, listStockMovements, createPart, updatePart, adjustStock, listCarried, addCarried, updateCarried, deleteCarried,
  };
}

export type NalogClient = ReturnType<typeof createNalogClient>;

function toNalogApiError(err: unknown): NalogApiError {
  if (axios.isCancel(err)) {
    return new NalogApiError('Request cancelled', null, {}, false);
  }
  if (!axios.isAxiosError(err)) {
    return new NalogApiError('Unexpected error', null, {}, false);
  }
  const ax = err as AxiosError<ApiProblem>;

  if (!ax.response) {
    // Timeout / offline / DNS: we do NOT know if the server saved it. Retrying create is safe
    // ONLY because it carries an Idempotency-Key.
    return new NalogApiError('Cannot reach the server. Check your connection; your data was not lost.', null, {}, true);
  }
  const { status, data } = ax.response;
  return new NalogApiError(
    data?.detail ?? data?.title ?? `Request failed (${status})`,
    status,
    data?.errors ?? {},
    status === 502 || status === 503 || status === 504,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
