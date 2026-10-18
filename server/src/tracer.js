// Tracing layer. Every agent, model call, tool call and MCP request is a span.
// Spans nest automatically through AsyncLocalStorage and are appended to a
// JSONL file so separate processes (API, CLI, MCP server) share one trace log.
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './store.js';

const als = new AsyncLocalStorage();
const TRACE_FILE = path.join(DATA_DIR, 'traces.jsonl');
const MAX_FIELD_CHARS = 2000;
const MAX_LINES_READ = 5000;

const now = () => performance.timeOrigin + performance.now();

function shrink(value) {
  if (value === undefined) return null;
  let s;
  try {
    s = JSON.stringify(value);
  } catch {
    return { unserializable: String(value) };
  }
  if (s === undefined) return null;
  return s.length > MAX_FIELD_CHARS ? { truncated: true, preview: s.slice(0, MAX_FIELD_CHARS) } : JSON.parse(s);
}

function write(record) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(TRACE_FILE, JSON.stringify(record) + '\n');
  } catch (err) {
    // Tracing must never break the request it observes.
    console.error('[tracer] could not write span:', err.message);
  }
}

export const newRunId = () => 'run_' + randomUUID().slice(0, 8);

export function withRun(runId, fn) {
  return als.run({ runId, parentId: null }, fn);
}

export function currentRunId() {
  return als.getStore()?.runId ?? null;
}

/** Run fn inside a span. kind: agent | model | tool | mcp */
export async function span({ kind, name, input }, fn) {
  const ctx = als.getStore() ?? { runId: 'adhoc', parentId: null };
  const id = 'sp_' + randomUUID().slice(0, 8);
  const record = { id, runId: ctx.runId, parentId: ctx.parentId, kind, name, input: shrink(input), startedAt: now() };
  const t0 = performance.now();
  try {
    const out = await als.run({ runId: ctx.runId, parentId: id }, fn);
    record.status = 'ok';
    record.output = shrink(out);
    return out;
  } catch (err) {
    record.status = 'error';
    record.error = err.message;
    throw err;
  } finally {
    record.durationMs = Math.round((performance.now() - t0) * 100) / 100;
    write(record);
  }
}

function readAll() {
  if (!fs.existsSync(TRACE_FILE)) return [];
  const lines = fs.readFileSync(TRACE_FILE, 'utf8').split('\n').filter(Boolean).slice(-MAX_LINES_READ);
  const spans = [];
  for (const line of lines) {
    try {
      spans.push(JSON.parse(line));
    } catch {
      /* skip a half-written line */
    }
  }
  return spans;
}

export function getRun(runId) {
  return readAll()
    .filter((s) => s.runId === runId)
    .sort((a, b) => a.startedAt - b.startedAt);
}

export function listRuns(limit = 20) {
  const byRun = new Map();
  for (const s of readAll()) {
    if (!byRun.has(s.runId)) byRun.set(s.runId, []);
    byRun.get(s.runId).push(s);
  }
  return [...byRun.entries()]
    .map(([runId, spans]) => {
      const root = spans.find((s) => s.parentId === null) ?? spans[0];
      return {
        runId,
        startedAt: Math.min(...spans.map((s) => s.startedAt)),
        label: root.input?.request ?? root.name,
        spanCount: spans.length,
        toolCalls: spans.filter((s) => s.kind === 'tool').length,
        errors: spans.filter((s) => s.status === 'error').length,
      };
    })
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
}
