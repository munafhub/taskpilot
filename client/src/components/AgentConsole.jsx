import { useState } from 'react';
import { api } from '../api.js';

const EXAMPLES = ['add write report high priority by tomorrow, then plan my day', 'summarize my workload', 'complete the README task'];

export default function AgentConsole({ onRun }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function send(e, override) {
    e?.preventDefault();
    const request = (override ?? text).trim();
    if (!request) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.askAgent(request);
      setResult(res);
      setText('');
      onRun(res.runId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="agent-h">
      <h2 id="agent-h">Ask the crew</h2>
      <form className="ask" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. add call dentist by tomorrow" maxLength={500} aria-label="Request for the agents" />
        <button disabled={busy || !text.trim()}>{busy ? 'Working' : 'Send'}</button>
      </form>
      <div className="chips">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="chip" disabled={busy} onClick={() => send(null, ex)}>{ex}</button>
        ))}
      </div>

      {error && <p className="banner" role="alert">{error}</p>}

      {result && (
        <div className="reply" aria-live="polite">
          {result.results.length === 0 && <p>{result.reply}</p>}
          {result.results.map((r, i) => (
            <div key={i} className={`step ${r.ok ? 'ok' : 'fail'}`}>
              <span className="worker">{r.worker}</span>
              <p>{r.ok ? r.message : `Could not do "${r.instruction}": ${r.message}`}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
