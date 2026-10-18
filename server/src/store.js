// File-backed task store. Plain JSON on disk so the Express API and the
// separately spawned MCP server process always see the same data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.TASKPILOT_DATA_DIR || path.resolve(here, '../data');
const FILE = path.join(DATA_DIR, 'tasks.json');

export const PRIORITIES = ['low', 'medium', 'high'];
export const STATUSES = ['open', 'done'];

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const addDaysISO = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

function seed() {
  const now = new Date().toISOString();
  const mk = (id, title, priority, due) => ({ id, title, priority, due, status: 'open', createdAt: now, completedAt: null });
  return [
    mk('t_seed001', 'Review pull request for scaffold', 'high', todayISO()),
    mk('t_seed002', 'Write README architecture section', 'medium', addDaysISO(1)),
    mk('t_seed003', 'Email mentor the weekly update', 'high', addDaysISO(-1)),
    mk('t_seed004', 'Tidy up prompts.md', 'low', null),
  ];
}

function save(tasks) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2));
  fs.renameSync(tmp, FILE);
}

function load() {
  if (!fs.existsSync(FILE)) {
    const initial = seed();
    save(initial);
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    throw new HttpError(500, `Task file is not valid JSON: ${FILE}. Fix or delete it to reset to the sample data.`);
  }
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function cleanTitle(title) {
  if (typeof title !== 'string' || !title.trim()) throw new HttpError(400, 'title is required and must be a non-empty string.');
  const t = title.trim();
  if (t.length > 120) throw new HttpError(400, `title is ${t.length} characters; the maximum is 120.`);
  return t;
}
function cleanPriority(p) {
  if (!PRIORITIES.includes(p)) throw new HttpError(400, `priority must be one of: ${PRIORITIES.join(', ')}.`);
  return p;
}
function cleanDue(due) {
  if (due === null) return null;
  if (typeof due !== 'string' || !validDate(due)) throw new HttpError(400, 'due must be a real date formatted YYYY-MM-DD (or null).');
  return due;
}

export function listTasks({ status } = {}) {
  if (status !== undefined && !STATUSES.includes(status)) {
    throw new HttpError(400, `status must be one of: ${STATUSES.join(', ')}.`);
  }
  const tasks = load();
  return status ? tasks.filter((t) => t.status === status) : tasks;
}

export function getTask(id) {
  const task = load().find((t) => t.id === id);
  if (!task) throw new HttpError(404, `No task with id "${id}".`);
  return task;
}

export function createTask({ title, priority = 'medium', due = null } = {}) {
  const task = {
    id: 't_' + randomUUID().slice(0, 8),
    title: cleanTitle(title),
    priority: cleanPriority(priority),
    due: cleanDue(due),
    status: 'open',
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  const tasks = load();
  tasks.push(task);
  save(tasks);
  return task;
}

export function updateTask(id, patch = {}) {
  const allowed = ['title', 'priority', 'due', 'status'];
  const unknown = Object.keys(patch).filter((k) => !allowed.includes(k));
  if (unknown.length) throw new HttpError(400, `Cannot update: ${unknown.join(', ')}. Allowed fields: ${allowed.join(', ')}.`);
  const tasks = load();
  const task = tasks.find((t) => t.id === id);
  if (!task) throw new HttpError(404, `No task with id "${id}".`);
  if ('title' in patch) task.title = cleanTitle(patch.title);
  if ('priority' in patch) task.priority = cleanPriority(patch.priority);
  if ('due' in patch) task.due = cleanDue(patch.due);
  if ('status' in patch) {
    if (!STATUSES.includes(patch.status)) throw new HttpError(400, `status must be one of: ${STATUSES.join(', ')}.`);
    task.status = patch.status;
    task.completedAt = patch.status === 'done' ? new Date().toISOString() : null;
  }
  save(tasks);
  return task;
}

export const completeTask = (id) => updateTask(id, { status: 'done' });

export function deleteTask(id) {
  const tasks = load();
  const i = tasks.findIndex((t) => t.id === id);
  if (i === -1) throw new HttpError(404, `No task with id "${id}".`);
  const [removed] = tasks.splice(i, 1);
  save(tasks);
  return removed;
}
