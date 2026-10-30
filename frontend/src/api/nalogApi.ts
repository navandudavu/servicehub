import axios, { AxiosError, AxiosInstance, Method } from 'axios';
import type {
  ApiProblem, CreateNalogRequest, CustomerView, CreatePartRequest, NalogListQuery, NalogPreview, NalogResponse,
  NalogStatus, NalogSummary, PageResponse, PartResponse, PreviewRequest, StatusHistoryView,
  StockAdjustRequest, TechnicianView, UpdatePartRequest, PhotoView, PhotoCategory,
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

  // The technician list lives in the nalog service's own user table. Before reading it, push the
  // Node team list in (admin only, at most once a minute) so everyone from the Team tab shows up.
  let lastUserSync = 0;
  const syncUsers = async (signal?: AbortSignal) => {
    if (Date.now() - lastUserSync < 60_000) return;
    try {
      const users = await send<Array<{ id: number; name: string; role: string; active: number | boolean }>>(
        'GET', '/api/users', { safeToRetry: true, signal });
      await send('POST', '/api/nalozi/users/sync', {
        data: users.map((u) => ({ id: u.id, name: u.name, role: u.role, active: !!u.active })),
        safeToRetry: true, signal,
      });
      lastUserSync = Date.now();
    } catch { /* not admin, or a service is down: fall back to whatever the nalog service already knows */ }
  };

  const listTechnicians = async (signal?: AbortSignal) => {
    await syncUsers(signal);
    return send<TechnicianView[]>('GET', '/api/nalozi/technicians', { safeToRetry: true, signal });
  };

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

  /** Image bytes need the Authorization header, so a plain <img src> can't be used: fetch as a blob. */
  const fetchPhotoBlob = (nalogId: number, photoId: number, signal?: AbortSignal) =>
    send<Blob>('GET', `/api/nalozi/${nalogId}/photos/${photoId}/file`, { safeToRetry: true, responseType: 'blob', signal });

  // ---- parts / inventory ----
  const searchParts = (q: string, opts: { onlyActive?: boolean; page?: number; size?: number } = {}, signal?: AbortSignal) =>
    send<PageResponse<PartResponse>>('GET', '/api/parts', { params: { q, ...opts }, safeToRetry: true, signal });

  // admin-only on the server
  const createPart = (req: CreatePartRequest) =>
    send<PartResponse>('POST', '/api/parts', { data: req, safeToRetry: false });
  const updatePart = (id: number, req: UpdatePartRequest) =>
    send<PartResponse>('PUT', `/api/parts/${id}`, { data: req, safeToRetry: true });
  const adjustStock = (id: number, req: StockAdjustRequest) =>
    send<PartResponse>('POST', `/api/parts/${id}/stock`, { data: req, safeToRetry: false });

  return {
    newIdempotencyKey, submitNalog, previewNalog, listNalozi, getNalog, getNalogHistory, changeStatus,
    searchCustomers, assignNalog, listTechnicians, listPhotos, uploadPhoto, deletePhoto, fetchPhotoBlob, searchParts, createPart, updatePart, adjustStock,
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
