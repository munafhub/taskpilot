#!/usr/bin/env node
// TaskPilot MCP server: newline-delimited JSON-RPC 2.0 over stdio.
// Exposes one resource (taskpilot://tasks) and the tools from the shared registry.
// stdout is reserved for protocol messages; all logging goes to stderr.
import readline from 'node:readline';
import { tools, callTool, hasTool, ToolInputError } from '../src/tools/registry.js';
import { listTasks } from '../src/store.js';
import { span, withRun, newRunId } from '../src/tracer.js';

const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];
const RESOURCE_URI = 'taskpilot://tasks';
const log = (...a) => console.error('[taskpilot-mcp]', ...a);

class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

const methods = {
  initialize: (params) => ({
    protocolVersion: SUPPORTED.includes(params?.protocolVersion) ? params.protocolVersion : SUPPORTED[0],
    capabilities: { resources: {}, tools: {} },
    serverInfo: { name: 'taskpilot', version: '0.1.0' },
  }),
  ping: () => ({}),
  'resources/list': () => ({
    resources: [
      {
        uri: RESOURCE_URI,
        name: 'Tasks',
        description: 'All TaskPilot tasks (open and done) as JSON.',
        mimeType: 'application/json',
      },
    ],
  }),
  'resources/read': (params) => {
    if (params?.uri !== RESOURCE_URI) throw new RpcError(-32002, `Resource not found: ${params?.uri}. Available: ${RESOURCE_URI}`);
    return { contents: [{ uri: RESOURCE_URI, mimeType: 'application/json', text: JSON.stringify(listTasks(), null, 2) }] };
  },
  'tools/list': () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }),
  'tools/call': async (params) => {
    if (!hasTool(params?.name)) {
      throw new RpcError(-32602, `Unknown tool: ${params?.name}. Available: ${tools.map((t) => t.name).join(', ')}`);
    }
    try {
      const result = await callTool(params.name, params.arguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: false };
    } catch (err) {
      // Tool failures are results (isError), not protocol errors, so the model can read and recover.
      if (!(err instanceof ToolInputError) && !err.status) log('tool crashed:', err);
      return { content: [{ type: 'text', text: err.message }], isError: true };
    }
  },
};

async function handle(msg) {
  const isRequest = msg.id !== undefined && msg.id !== null;
  if (!isRequest) return; // notifications (e.g. notifications/initialized) need no reply
  try {
    const fn = methods[msg.method];
    if (!fn) throw new RpcError(-32601, `Method not found: ${msg.method}`);
    const result = await withRun(newRunId(), () => span({ kind: 'mcp', name: `mcp:${msg.method}`, input: msg.params }, () => fn(msg.params)));
    send({ jsonrpc: '2.0', id: msg.id, result });
  } catch (err) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: err.code ?? -32603, message: err.message } });
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: each line must be one JSON-RPC message.' } });
  }
  handle(msg);
});
rl.on('close', () => process.exit(0));
log('ready on stdio');
