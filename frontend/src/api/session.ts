/**
 * Keeps the browser logged in. The login token lasts 12 hours; the refresh token (30 days, single use) trades itself for
 * a new pair. Every request layer calls refreshSession() when it gets a 401 and then repeats the request once.
 * Only one refresh runs at a time: the refresh token is single use, so two parallel refreshes would log the user out.
 */
const TOKEN_KEY = 'servicehub_token';
const REFRESH_KEY = 'servicehub_refresh';

export type RefreshOutcome = 'ok' | 'rejected' | 'unavailable';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage blocked: the session just ends at expiry */ }
}
function remove(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export function storeSession(token: string, refreshToken?: string | null) {
  write(TOKEN_KEY, token);
  if (refreshToken) write(REFRESH_KEY, refreshToken);
}

export function clearSession() {
  remove(TOKEN_KEY);
  remove(REFRESH_KEY);
}

/** Logout: tell the server to kill the refresh token (best effort), then forget both tokens. */
export function endSession() {
  const refresh = read(REFRESH_KEY);
  clearSession();
  if (refresh) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    }).catch(() => { /* offline: the token simply expires */ });
  }
}

let inFlight: Promise<RefreshOutcome> | null = null;

/**
 * 'ok'          new tokens are stored, repeat the request
 * 'rejected'    the server refused the refresh token: the session is over (tokens are cleared)
 * 'unavailable' no refresh token, or the server could not be reached: keep what we have, do not log out
 */
export function refreshSession(): Promise<RefreshOutcome> {
  if (inFlight) return inFlight;
  const refresh = read(REFRESH_KEY);
  if (!refresh) return Promise.resolve('rejected');
  inFlight = (async (): Promise<RefreshOutcome> => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (res.status === 401) { clearSession(); return 'rejected'; }
      if (!res.ok) return 'unavailable';
      const data = await res.json();
      if (!data?.token || !data?.refreshToken) return 'unavailable';
      storeSession(data.token, data.refreshToken);
      return 'ok';
    } catch {
      return 'unavailable';
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
