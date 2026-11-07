// Accounts only (login, who am I, team). Everything else (nalozi, customers, parts, reports) goes through nalogApi.
const BASE = '/api';

function getToken() {
  return localStorage.getItem('servicehub_token');
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty body, fine
  }

  if (!res.ok) {
    const message = data?.error || data?.detail || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me'),

  users: {
    list: () => request('/users'),
    create: (data) => request('/users', { method: 'POST', body: data }),
    update: (id, data) => request(`/users/${id}`, { method: 'PUT', body: data }),
    setActive: (id, active) => request(`/users/${id}/active`, { method: 'PATCH', body: { active } }),
    delete: (id) => request(`/users/${id}`, { method: 'DELETE' }),
    resetPassword: (id, newPassword) => request(`/users/${id}/reset-password`, { method: 'PATCH', body: { new_password: newPassword } }),
    changeMyPassword: (currentPassword, newPassword) => request('/users/me/password', { method: 'PATCH', body: { current_password: currentPassword, new_password: newPassword } })
  }
};

export { getToken };
