// Supervisor: plans once, routes each step to a worker, isolates failures,
// and composes one reply. Every step is traced under a single run id.
import { span, withRun, newRunId } from '../tracer.js';
import { planRequest } from './modelClient.js';
import { WORKERS } from './workers.js';
import { HttpError } from '../store.js';

const HELP = 'I can add or complete tasks, summarize your workload, or suggest what to do next. Try: "add write report by tomorrow, then plan my day".';

export async function runSupervisor(request) {
  if (typeof request !== 'string' || !request.trim()) throw new HttpError(400, 'request must be a non-empty string.');
  if (request.length > 500) throw new HttpError(400, `request is ${request.length} characters; the maximum is 500.`);
  const runId = newRunId();

  return withRun(runId, () =>
    span({ kind: 'agent', name: 'supervisor', input: { request } }, async () => {
      const plan = await planRequest(request.trim());
      const results = [];
      for (const step of plan.steps) {
        try {
          const out = await span({ kind: 'agent', name: `worker:${step.worker}`, input: { instruction: step.instruction } }, () =>
            WORKERS[step.worker].run(step.instruction)
          );
          results.push({ worker: step.worker, instruction: step.instruction, ok: true, message: out.message, data: out.data });
        } catch (err) {
          // One failing worker must not sink the rest of the plan.
          results.push({ worker: step.worker, instruction: step.instruction, ok: false, message: err.message });
        }
      }
      const reply = results.length ? results.map((r) => (r.ok ? r.message : `Could not do "${r.instruction}": ${r.message}`)).join('\n') : HELP;
      return { runId, reply, plan, results };
    })
  );
}
