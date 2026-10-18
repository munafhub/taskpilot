// Minimal custom MCP client over stdio. Spawns a server process and speaks JSON-RPC to it.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

export class MCPClient {
  constructor({ command = 'node', args, env = {}, cwd, timeoutMs = 10000 }) {
    this.opts = { command, args, env, cwd, timeoutMs };
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    const { command, args, env, cwd } = this.opts;
    this.child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
    this.child.on('exit', (code) => {
      for (const { reject } of this.pending.values()) reject(new Error(`MCP server exited (code ${code}) before replying.`));
      this.pending.clear();
    });
    readline.createInterface({ input: this.child.stdout }).on('line', (line) => this.#onLine(line));
    const init = await this.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'taskpilot-client', version: '0.1.0' },
    });
    this.notify('notifications/initialized');
    this.serverInfo = init.serverInfo;
    this.capabilities = init.capabilities;
    return init;
  }

  #onLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    this.pending.delete(msg.id);
    clearTimeout(entry.timer);
    if (msg.error) entry.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
    else entry.resolve(msg.result);
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request "${method}" timed out after ${this.opts.timeoutMs}ms.`));
      }, this.opts.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  notify(method, params) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  listResources = async () => (await this.request('resources/list')).resources;
  listTools = async () => (await this.request('tools/list')).tools;
  readResource = async (uri) => (await this.request('resources/read', { uri })).contents[0].text;
  async callTool(name, args = {}) {
    const res = await this.request('tools/call', { name, arguments: args });
    const text = res.content?.map((c) => c.text).join('') ?? '';
    if (res.isError) throw new Error(text);
    return JSON.parse(text);
  }

  close() {
    this.child?.stdin.end();
    this.child?.kill();
  }
}

export const serverClient = (extra = {}) =>
  new MCPClient({
    args: [fileURLToPath(new URL('./server.js', import.meta.url))],
    ...extra,
  });