import { createNalogClient } from './nalogApi';
import { clearSession, refreshSession } from './session';

/**
 * The one nalog API client for the whole app. It reuses the token the existing
 * ServiceHub login already stored - the Java service accepts the same JWT.
 *
 * baseURL is '' (same origin): in dev the Vite proxy sends /api/nalozi and /api/parts
 * to the Java service (port 8081); in production the reverse proxy does the same.
 */
export const nalogApi = createNalogClient({
  baseURL: '',
  getAuthorization: () => {
    const token = localStorage.getItem('servicehub_token');
    return token ? `Bearer ${token}` : null;
  },
  // 'unavailable' (server unreachable) is not a refusal: keep the session, the request just fails this time
  refreshSession: async () => (await refreshSession()) === 'ok',
  onUnauthorized: () => {
    // Same behaviour as an expired session anywhere else in the app.
    clearSession();
    if (window.location.pathname !== '/login') window.location.assign('/login');
  },
});
