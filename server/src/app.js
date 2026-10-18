import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import tasks from './routes/tasks.js';
import agent from './routes/agent.js';
import traces from './routes/traces.js';
import { ToolInputError } from './tools/registry.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientIndex = path.resolve(here, '../../client/dist/index.html');

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/tasks', tasks);
  app.use('/api/agent', agent);
  app.use('/api/traces', traces);

  // In production the built React app is served from the same origin.
  if (fs.existsSync(clientIndex)) {
    app.use(express.static(path.dirname(clientIndex)));
    app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(clientIndex) : next()));
  }

  app.use('/api', (req, res) => res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found.` }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Request body is not valid JSON.' });
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : err instanceof ToolInputError ? 400 : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Something went wrong on the server.' : err.message });
  });

  return app;
}
