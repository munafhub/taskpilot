const BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new Error('Cannot reach the API. Is the server running on port 4000?');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
  return body;
}

export const api = {
  listTasks: () => request('/tasks').then((b) => b.tasks),
  createTask: (task) => request('/tasks', { method: 'POST', body: JSON.stringify(task) }).then((b) => b.task),
  updateTask: (id, patch) => request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }).then((b) => b.task),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  askAgent: (text) => request('/agent', { method: 'POST', body: JSON.stringify({ request: text }) }),
  agentInfo: () => request('/agent/info'),
  getTrace: (runId) => request(`/traces/${runId}`).then((b) => b.spans),
};
