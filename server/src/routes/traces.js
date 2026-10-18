import { Router } from 'express';
import { getRun, listRuns } from '../tracer.js';
import { HttpError } from '../store.js';

const router = Router();

router.get('/', (req, res) => res.json({ runs: listRuns(Number(req.query.limit) || 20) }));

router.get('/:runId', (req, res) => {
  const spans = getRun(req.params.runId);
  if (!spans.length) throw new HttpError(404, `No trace found for run "${req.params.runId}".`);
  res.json({ runId: req.params.runId, spans });
});

export default router;
