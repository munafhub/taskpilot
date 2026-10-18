
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'taskpilot-api-test-')
);

process.env.TASKPILOT_DATA_DIR = dataDir;

const { createApp } = await import('../src/app.js');

let server;
let baseUrl;

before(async () => {
  server = createApp().listen(0);

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    });
  }

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('health endpoint returns success', async () => {
  const response = await fetch(`${baseUrl}/api/health`);

  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.ok, true);
});

test('creates and lists a task', async () => {
  const response = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Automated test task',
      priority: 'high',
      due: '2027-01-15',
    }),
  });

  assert.equal(response.status, 201);

  const body = await response.json();

  assert.equal(body.task.title, 'Automated test task');
  assert.equal(body.task.priority, 'high');
  assert.equal(body.task.status, 'open');

  const listResponse = await fetch(`${baseUrl}/api/tasks`);
  const listBody = await listResponse.json();

  assert.ok(
    listBody.tasks.some(
      (task) => task.id === body.task.id
    )
  );
});

test('rejects an empty task title', async () => {
  const response = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '   ' }),
  });

  assert.equal(response.status, 400);
});

test('rejects an invalid priority', async () => {
  const response = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Invalid priority task',
      priority: 'urgent',
    }),
  });

  assert.equal(response.status, 400);
});

test('updates a task to completed', async () => {
  const createResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Task to complete' }),
  });

  const { task } = await createResponse.json();

  const response = await fetch(
    `${baseUrl}/api/tasks/${task.id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    }
  );

  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.task.status, 'done');
});

test('deletes a task', async () => {
  const createResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Task to delete' }),
  });

  const { task } = await createResponse.json();

  const deleteResponse = await fetch(
    `${baseUrl}/api/tasks/${task.id}`,
    { method: 'DELETE' }
  );

  assert.equal(deleteResponse.status, 200);

  const getResponse = await fetch(
    `${baseUrl}/api/tasks/${task.id}`
  );

  assert.equal(getResponse.status, 404);
});