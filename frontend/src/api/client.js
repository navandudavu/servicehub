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
    const message = data?.error || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Separate from request() because file uploads need multipart/form-data -
// the browser sets that header itself (with the right boundary), so we must
// NOT set Content-Type manually here the way request() does for JSON.
async function uploadFile(path, file, extraFields = {}) {
  const formData = new FormData();
  formData.append('photo', file);
  Object.entries(extraFields).forEach(([key, val]) => {
    if (val !== undefined && val !== null) formData.append(key, val);
  });

  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: formData });

  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    const message = data?.error || `Upload failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Photo URLs need the auth token, so plain <img src="..."> won't work -
// the backend gates photos behind requireAuth. Fetch as a blob and make
// an object URL instead. Callers must revoke the URL when done with it.
async function fetchPhotoUrl(filename) {
  const token = getToken();
  const res = await fetch(`${BASE}/jobs/photos/${filename}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) throw new Error('Could not load photo');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// CSV export needs the auth header too, and it's a file download rather
// than a JSON response - fetch it as a blob and trigger a save the same
// way fetchPhotoUrl handles authenticated images, then clean up the
// object URL immediately since (unlike photos) nothing else needs it after.
async function downloadCsvExport(from, to) {
  const token = getToken();
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();

  const res = await fetch(`${BASE}/jobs/export/csv${qs ? `?${qs}` : ''}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try { message = (await res.json()).error || message; } catch { /* not JSON */ }
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `servicehub-export-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  },

  customers: {
    list: (search) => request(`/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id) => request(`/customers/${id}`),
    create: (data) => request('/customers', { method: 'POST', body: data }),
    update: (id, data) => request(`/customers/${id}`, { method: 'PUT', body: data }),
    delete: (id) => request(`/customers/${id}`, { method: 'DELETE' }),
    addAppliance: (customerId, data) => request(`/customers/${customerId}/appliances`, { method: 'POST', body: data })
  },

  jobs: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/jobs${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request(`/jobs/${id}`),
    create: (data) => request('/jobs', { method: 'POST', body: data }),
    delete: (id) => request(`/jobs/${id}`, { method: 'DELETE' }),
    bulkDelete: (ids) => request('/jobs/bulk-delete', { method: 'POST', body: { ids } }),
    bulkStatus: (ids, status) => request('/jobs/bulk-status', { method: 'POST', body: { ids, status } }),
    bulkAssign: (ids, assignedTo) => request('/jobs/bulk-assign', { method: 'POST', body: { ids, assigned_to: assignedTo } }),
    assign: (id, assignedTo) => request(`/jobs/${id}/assign`, { method: 'PATCH', body: { assigned_to: assignedTo } }),
    setStatus: (id, status) => request(`/jobs/${id}/status`, { method: 'PATCH', body: { status } }),
    addNote: (id, note) => request(`/jobs/${id}/notes`, { method: 'POST', body: { note } }),
    uploadPhoto: (id, file, caption) => uploadFile(`/jobs/${id}/photos`, file, { caption }),
    deletePhoto: (jobId, photoId) => request(`/jobs/${jobId}/photos/${photoId}`, { method: 'DELETE' }),
    setSchedule: (id, scheduledAt) => request(`/jobs/${id}/schedule`, { method: 'PATCH', body: { scheduled_at: scheduledAt } }),
    setHours: (id, hours) => request(`/jobs/${id}/hours`, { method: 'PATCH', body: { hours_logged: hours } }),
    stats: () => request('/jobs/stats/summary'),
    exportCsv: (from, to) => downloadCsvExport(from, to),
    calendarRange: (from, to, all) => {
      const params = new URLSearchParams({ from, to });
      if (all) params.set('all', '1');
      return request(`/jobs/calendar/range?${params.toString()}`);
    }
  }
};

export { getToken, fetchPhotoUrl };
