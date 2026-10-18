import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import TaskPanel from './components/TaskPanel.jsx';
import AgentConsole from './components/AgentConsole.jsx';
import TracePanel from './components/TracePanel.jsx';

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const [runId, setRunId] = useState(null);
  const [info, setInfo] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setTasks(await api.listTasks());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    api.agentInfo().then(setInfo).catch(() => {});
  }, [refresh]);

  return (
    <div className="shell">
      <header className="masthead">
        <h1>TaskPilot</h1>
        <p className="tagline">Tell the crew what you need. Watch every step they take.</p>
        {info && <span className="mode">{info.mode === 'live' ? `Live: ${info.model}` : 'Mock model'}</span>}
      </header>

      {error && <p className="banner" role="alert">{error}</p>}

      <main className="board">
        <TaskPanel tasks={tasks} onChange={refresh} onError={setError} />
        <div className="stack">
          <AgentConsole onRun={(id) => { setRunId(id); refresh(); }} />
          <TracePanel runId={runId} />
        </div>
      </main>
    </div>
  );
}
