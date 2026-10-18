// Worker agents. Each one is narrow: it only knows how to do one kind of job,
// and it does its work exclusively through traced tools.
import { callTool } from '../tools/registry.js';
import { todayISO, addDaysISO } from '../store.js';

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function parseNewTask(instruction) {
  let text = instruction.replace(/^(add|create|new|remind me to)\s+(a\s+)?(new\s+)?(task\s+)?(to\s+)?/i, '').trim();
  let priority;
  if (/\b(high|urgent)\b/i.test(text)) priority = 'high';
  else if (/\blow\b/i.test(text)) priority = 'low';
  let due;
  const iso = text.match(/\b(?:by|due)\s+(\d{4}-\d{2}-\d{2})\b/i);
  if (iso) due = iso[1];
  else if (/\b(?:by|due)\s+today\b/i.test(text)) due = todayISO();
  else if (/\b(?:by|due)\s+tomorrow\b/i.test(text)) due = addDaysISO(1);
  text = text
    .replace(/\b(?:by|due)\s+(\d{4}-\d{2}-\d{2}|today|tomorrow)\b/gi, '')
    .replace(/\b(with\s+)?(high|urgent|low|medium)\s+priority\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:]+|[\s,.;:]+$/g, '');
  return { title: text, ...(priority && { priority }), ...(due && { due }) };
}

const taskkeeper = {
  name: 'taskkeeper',
  async run(instruction) {
    if (/^(add|create|new|remind me to)\b/i.test(instruction)) {
      const args = parseNewTask(instruction);
      if (!args.title) throw new Error('I could not find a task title. Try: add "Buy milk" by tomorrow.');
      const task = await callTool('create_task', args);
      return { message: `Created "${task.title}" (${task.priority}${task.due ? `, due ${task.due}` : ''}).`, data: task };
    }
    const wanted = instruction
      .replace(/^(mark|complete|finish|done with)\s+/i, '')
      .replace(/\s+(as\s+)?(done|complete|completed|finished)$/i, '')
      .replace(/^(the\s+)?(task\s+)?/i, '')
      .replace(/\s+task$/i, '')
      .replace(/^["']|["']$/g, '')
      .trim()
      .toLowerCase();
    if (!wanted) throw new Error('Tell me which task to complete, e.g. "complete the README task".');
    const open = await callTool('list_tasks', { status: 'open' });
    const match = open.find((t) => t.title.toLowerCase().includes(wanted));
    if (!match) {
      const titles = open.map((t) => `"${t.title}"`).join(', ') || 'none';
      throw new Error(`No open task matches "${wanted}". Open tasks: ${titles}.`);
    }
    const done = await callTool('complete_task', { id: match.id });
    return { message: `Completed "${done.title}".`, data: done };
  },
};

const analyst = {
  name: 'analyst',
  async run(instruction) {
    if (/\b(summari[sz]e|stats|workload|how many|overdue|status)\b/i.test(instruction)) {
      const s = await callTool('workload_stats');
      const p = s.openByPriority;
      return {
        message: `${s.open} open, ${s.done} done. ${s.overdue} overdue, ${s.dueToday} due today. Open by priority: ${p.high} high, ${p.medium} medium, ${p.low} low.`,
        data: s,
      };
    }
    const open = await callTool('list_tasks', { status: 'open' });
    if (!open.length) return { message: 'No open tasks.', data: [] };
    return { message: `Open tasks: ${open.map((t) => t.title).join('; ')}.`, data: open };
  },
};

const scheduler = {
  name: 'scheduler',
  async run() {
    const open = await callTool('list_tasks', { status: 'open' });
    if (!open.length) return { message: 'Nothing to schedule: no open tasks.', data: [] };
    const today = todayISO();
    const ordered = [...open]
      .sort((a, b) => {
        const ao = a.due && a.due < today ? 0 : 1;
        const bo = b.due && b.due < today ? 0 : 1;
        return ao - bo || (a.due ?? '9999').localeCompare(b.due ?? '9999') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      })
      .slice(0, 5);
    const why = (t) => (t.due && t.due < today ? 'overdue' : t.due === today ? 'due today' : t.due ? `due ${t.due}` : 'no due date');
    const lines = ordered.map((t, i) => `${i + 1}. ${t.title} (${t.priority}, ${why(t)})`);
    return { message: `Suggested order: ${lines.join(' ')}`, data: ordered };
  },
};

export const WORKERS = { taskkeeper, analyst, scheduler };
