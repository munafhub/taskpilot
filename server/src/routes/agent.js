import { Router } from 'express';
import { runSupervisor } from '../agents/supervisor.js';
import { modelMode, modelName } from '../agents/modelClient.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const out = await runSupervisor(req.body?.request);
    res.json(out);
  } catch (err) {
    next(err);
  }
});

router.get('/info', (req, res) => res.json({ mode: modelMode(), model: modelMode() === 'live' ? modelName() : 'mock' }));

export default router;
