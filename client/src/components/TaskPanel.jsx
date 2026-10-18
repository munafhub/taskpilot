import { useState } from 'react';
import { api } from '../api.js';

const today = () => new Date().toISOString().slice(0, 10);

export default function TaskPanel({ tasks, onChange, onError }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action) {
    setBusy(true);
    try {
      await action();
      onError('');
      await onChange();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    run(async () => {
      await api.createTask({ title, priority, due: due || undefined });
      setTitle('');
      setDue('');
    });
  };

  const open = tasks.filter((t) => t.status === 'open');
  const done = tasks.filter((t) => t.status === 'done');

  const Row = ({ t }) => (
    <li className={`task ${t.status}`}>
      <input
        type="checkbox"
        checked={t.status === 'done'}
        aria-label={`Mark "${t.title}" ${t.status === 'done' ? 'open' : 'done'}`}
        onChange={() => run(() => api.updateTask(t.id, { status: t.status === 'done' ? 'open' : 'done' }))}
      />
      <span className="title">{t.title}</span>
      <span className={`pill ${t.priority}`}>{t.priority}</span>
      {t.due && <span className={`due ${t.status === 'open' && t.due < today() ? 'late' : ''}`}>{t.due}</span>}
      <button className="ghost" aria-label={`Delete "${t.title}"`} onClick={() => run(() => api.deleteTask(t.id))}>Delete</button>
    </li>
  );

  return (
    <section className="panel" aria-labelledby="tasks-h">
      <h2 id="tasks-h">Tasks</h2>
      <form className="add" onSubmit={submit}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" maxLength={120} aria-label="Task title" />
        <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
        <button disabled={busy || !title.trim()}>Add task</button>
      </form>

      {open.length === 0 && <p className="empty">Nothing open. Add a task above, or ask the crew to.</p>}
      <ul className="tasks">{open.map((t) => <Row key={t.id} t={t} />)}</ul>

      {done.length > 0 && (
        <>
          <h3>Done</h3>
          <ul className="tasks">{done.map((t) => <Row key={t.id} t={t} />)}</ul>
        </>
      )}
    </section>
  );
}
