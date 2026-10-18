import { Router } from 'express';
import { callTool } from '../tools/registry.js';
import { listTasks, getTask, createTask, updateTask, deleteTask, HttpError } from '../store.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

router.get('/', wrap(async (req, res) => {
  const { status } = req.query;
  res.json({ tasks: listTasks({ status }) });
}));

router.get('/:id', wrap(async (req, res) => res.json({ task: getTask(req.params.id) })));

router.post('/', wrap(async (req, res) => {
  if (!req.body || typeof req.body !== 'object') throw new HttpError(400, 'Request body must be JSON.');
  const { title, priority, due } = req.body;
  const task = await callTool('create_task', Object.fromEntries(Object.entries({ title, priority, due }).filter(([, v]) => v !== undefined && v !== null && v !== '')));
  res.status(201).json({ task });
}));

router.patch('/:id', wrap(async (req, res) => {
  if (!req.body || typeof req.body !== 'object') throw new HttpError(400, 'Request body must be JSON.');
  res.json({ task: updateTask(req.params.id, req.body) });
}));

router.delete('/:id', wrap(async (req, res) => res.json({ task: deleteTask(req.params.id) })));

export default router;
