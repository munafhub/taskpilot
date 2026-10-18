import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

function layout(spans) {
  const byId = new Map(spans.map((s) => [s.id, s]));
  const depth = (s) => (s.parentId && byId.has(s.parentId) ? 1 + depth(byId.get(s.parentId)) : 0);
  const start = Math.min(...spans.map((s) => s.startedAt));
  const end = Math.max(...spans.map((s) => s.startedAt + s.durationMs));
  const total = Math.max(end - start, 0.001);
  return spans.map((s) => ({
    ...s,
    depth: depth(s),
    left: ((s.startedAt - start) / total) * 100,
    width: Math.max((s.durationMs / total) * 100, 1.5),
  }));
}

export default function TracePanel({ runId }) {
  const [spans, setSpans] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!runId) return;
    setError('');
    api.getTrace(runId).then(setSpans).catch((err) => setError(err.message));
  }, [runId]);

  const rows = useMemo(() => (spans.length ? layout(spans) : []), [spans]);

  return (
    <section className="panel" aria-labelledby="trace-h">
      <h2 id="trace-h">Trace</h2>
      {!runId && <p className="empty">Send a request to the crew and every agent, model and tool call shows up here.</p>}
      {error && <p className="banner" role="alert">{error}</p>}
      {rows.length > 0 && (
        <div className="waterfall">
          {rows.map((s) => (
            <details key={s.id} className={`span ${s.kind} ${s.status}`}>
              <summary>
                <span className="label" style={{ paddingLeft: `${s.depth * 14}px` }}>
                  <b>{s.kind}</b> {s.name}
                </span>
                <span className="track" aria-hidden="true">
                  <span className="bar" style={{ left: `${s.left}%`, width: `${s.width}%` }} />
                </span>
                <span className="ms">{s.durationMs} ms</span>
              </summary>
              <pre>{JSON.stringify({ input: s.input, output: s.output, error: s.error }, null, 2)}</pre>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
