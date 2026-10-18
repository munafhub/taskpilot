// Single source of truth for tools. Agents, the Express API and the MCP server
// all call tools through callTool(), so every call is validated and traced.
import { span } from '../tracer.js';
import { listTasks, createTask, completeTask, todayISO, PRIORITIES } from '../store.js';

export class ToolInputError extends Error {}
export class UnknownToolError extends Error {}

export const tools = [
  {
    name: 'list_tasks',
    description: 'List tasks. Optionally filter by status ("open" or "done"). Returns an array of task objects.',
    inputSchema: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['open', 'done'], description: 'Only return tasks with this status.' } },
      additionalProperties: false,
    },
    handler: (args) => listTasks(args),
  },
  {
    name: 'create_task',
    description: 'Create a new open task. Returns the created task including its id.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short task title, max 120 characters.' },
        priority: { type: 'string', enum: PRIORITIES, description: 'Defaults to "medium".' },
        due: { type: 'string', description: 'Due date as YYYY-MM-DD.' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    handler: (args) => createTask(args),
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done by id. Use list_tasks first if you only know the title.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Task id, e.g. "t_ab12cd34".' } },
      required: ['id'],
      additionalProperties: false,
    },
    handler: ({ id }) => completeTask(id),
  },
  {
    name: 'workload_stats',
    description: 'Counts of open/done/overdue tasks, tasks due today, and open tasks per priority.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: () => {
      const all = listTasks();
      const open = all.filter((t) => t.status === 'open');
      const today = todayISO();
      return {
        total: all.length,
        open: open.length,
        done: all.length - open.length,
        overdue: open.filter((t) => t.due && t.due < today).length,
        dueToday: open.filter((t) => t.due === today).length,
        openByPriority: Object.fromEntries(PRIORITIES.map((p) => [p, open.filter((t) => t.priority === p).length])),
      };
    },
  },
];

const byName = new Map(tools.map((t) => [t.name, t]));
export const hasTool = (name) => byName.has(name);

function describeSchema(schema) {
  const req = new Set(schema.required ?? []);
  const parts = Object.entries(schema.properties ?? {}).map(([k, v]) => {
    const type = v.enum ? v.enum.join('|') : v.type;
    return `${k}${req.has(k) ? '' : '?'}: ${type}`;
  });
  return `{ ${parts.join(', ')} }`;
}

/** Minimal JSON-schema check with error messages a model can act on. */
export function validateArgs(tool, args) {
  const { inputSchema: schema } = tool;
  const hint = `Expected ${describeSchema(schema)}.`;
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    throw new ToolInputError(`${tool.name}: arguments must be an object. ${hint}`);
  }
  for (const key of schema.required ?? []) {
    if (args[key] === undefined) throw new ToolInputError(`${tool.name}: missing required argument "${key}". ${hint}`);
  }
  for (const [key, value] of Object.entries(args)) {
    const prop = schema.properties?.[key];
    if (!prop) throw new ToolInputError(`${tool.name}: unknown argument "${key}". ${hint}`);
    if (prop.type === 'string' && typeof value !== 'string') {
      throw new ToolInputError(`${tool.name}: "${key}" must be a string, got ${typeof value}. ${hint}`);
    }
    if (prop.enum && !prop.enum.includes(value)) {
      throw new ToolInputError(`${tool.name}: "${key}" must be one of ${prop.enum.join(', ')}; got "${value}".`);
    }
  }
}

export async function callTool(name, args = {}) {
  const tool = byName.get(name);
  if (!tool) {
    throw new UnknownToolError(`Unknown tool "${name}". Available tools: ${tools.map((t) => t.name).join(', ')}.`);
  }
  return span({ kind: 'tool', name, input: args }, async () => {
    validateArgs(tool, args);
    return tool.handler(args);
  });
}
