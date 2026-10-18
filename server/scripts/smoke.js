// End-to-end check on mock data: agents + tracing + MCP server/client. Run: npm run smoke
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskpilot-'));
process.env.TASKPILOT_DATA_DIR = dir; // read at import time, so set before importing
process.env.MODEL_MODE = 'mock';

const { runSupervisor } = await import('../src/agents/supervisor.js');
const { getRun, listRuns } = await import('../src/tracer.js');
const { listTasks } = await import('../src/store.js');
const { serverClient } = await import('../mcp/client.js');
const { validatePlan } = await import('../src/agents/modelClient.js');

let passed = 0;
const check = (name, fn) => Promise.resolve(fn()).then(() => { passed++; console.log('PASS', name); });

await check('supervisor routes a multi-step request to 3 different workers', async () => {
  const res = await runSupervisor('add write report high priority by tomorrow, then summarize my workload and plan my day');
  assert.deepEqual(res.plan.steps.map((s) => s.worker), ['taskkeeper', 'analyst', 'scheduler']);
  assert.ok(res.results.every((r) => r.ok), res.reply);
  assert.ok(listTasks().some((t) => t.title === 'write report' && t.priority === 'high'));
  const spans = getRun(res.runId);
  assert.ok(spans.filter((s) => s.kind === 'agent' && s.name.startsWith('worker:')).length >= 2);
  assert.ok(spans.filter((s) => s.kind === 'tool').length >= 3);
  assert.ok(spans.some((s) => s.kind === 'model'));
});

await check('completing a task by partial title works', async () => {
  const res = await runSupervisor('complete the README task');
  assert.ok(res.results[0].ok, res.reply);
  assert.ok(listTasks().find((t) => t.title.includes('README')).status === 'done');
});

await check('a failing worker is isolated and traced as an error', async () => {
  const res = await runSupervisor('complete the unicorn task, then show my tasks');
  assert.equal(res.results[0].ok, false);
  assert.match(res.results[0].message, /Open tasks:/);
  assert.equal(res.results[1].ok, true);
  assert.ok(getRun(res.runId).some((s) => s.status === 'error'));
});

await check('unrecognised request returns help, not a crash', async () => {
  const res = await runSupervisor('what is the capital of France');
  assert.equal(res.plan.steps.length, 0);
  assert.match(res.reply, /add or complete tasks/);
});

await check('plan validation rejects unknown workers', () => {
  assert.throws(() => validatePlan({ steps: [{ worker: 'hacker', instruction: 'x' }] }), /worker must be one of/);
});

await check('MCP client can list, read, call, and gets helpful errors', async () => {
  const client = serverClient();
  await client.connect();
  try {
    assert.ok((await client.listResources()).some((r) => r.uri === 'taskpilot://tasks'));
    assert.ok((await client.listTools()).length >= 1);
    const created = await client.callTool('create_task', { title: 'via mcp' });
    const tasks = JSON.parse(await client.readResource('taskpilot://tasks'));
    assert.ok(tasks.some((t) => t.id === created.id));
    await assert.rejects(() => client.callTool('create_task', {}), /missing required argument "title"/);
    await assert.rejects(() => client.callTool('nope', {}), /Unknown tool/);
  } finally {
    client.close();
  }
});

await check('tool calls from the MCP process land in the shared trace log', () => {
  const runs = listRuns(50);
  assert.ok(runs.some((r) => r.toolCalls >= 1 && r.label.startsWith('mcp:')));
});

console.log(`\n${passed} checks passed (data dir: ${dir})`);
