import { createNalogClient } from './nalogApi';

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
  onUnauthorized: () => {
    // Same behaviour as an expired session anywhere else in the app.
    localStorage.removeItem('servicehub_token');
    if (window.location.pathname !== '/login') window.location.assign('/login');
  },
});
