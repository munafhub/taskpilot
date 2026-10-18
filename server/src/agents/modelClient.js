// Model client. Mock mode is deterministic (tests, CI, offline, zero cost).
// Live mode asks a small Claude model for a routing plan, validates the JSON,
// and falls back to the mock planner if anything is off.
import { span } from '../tracer.js';

export const WORKER_NAMES = ['taskkeeper', 'analyst', 'scheduler'];
const MAX_STEPS = 5;

export const modelMode = () => process.env.MODEL_MODE || (process.env.ANTHROPIC_API_KEY ? 'live' : 'mock');
export const modelName = () => process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

/** Output validation = guardrail. Throws if the plan is not usable. */
export function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.steps)) throw new Error('plan.steps must be an array');
  if (plan.steps.length > MAX_STEPS) throw new Error(`plan has ${plan.steps.length} steps; max is ${MAX_STEPS}`);
  const steps = plan.steps.map((s, i) => {
    if (!s || !WORKER_NAMES.includes(s.worker)) {
      throw new Error(`step ${i}: worker must be one of ${WORKER_NAMES.join(', ')}; got ${JSON.stringify(s?.worker)}`);
    }
    if (typeof s.instruction !== 'string' || !s.instruction.trim()) throw new Error(`step ${i}: instruction must be a non-empty string`);
    return { worker: s.worker, instruction: s.instruction.trim() };
  });
  return { steps };
}

const SPLIT = /\s*(?:;|\bthen\b|\band\s+(?=(?:summari[sz]e|plan|schedule|show|list|prioriti[sz]e|mark|complete|finish|add|create)\b))\s*/i;

function classifyClause(clause) {
  const c = clause.trim();
  if (!c) return null;
  if (/^(add|create|new|remind me to)\b/i.test(c)) return 'taskkeeper';
  if (/^(mark|complete|finish|done with)\b/i.test(c)) return 'taskkeeper';
  if (/\b(plan|schedule|prioriti[sz]e|focus|what should i)\b/i.test(c)) return 'scheduler';
  if (/\b(summari[sz]e|stats|workload|how many|overdue|status|show|list)\b/i.test(c)) return 'analyst';
  return null;
}

export function mockPlan(request) {
  const steps = request
    .split(SPLIT)
    .map((clause) => ({ worker: classifyClause(clause), instruction: clause.replace(/^[\s,.;:]+|[\s,.;:]+$/g, '') }))
    .filter((s) => s.worker);
  return { steps };
}

const SYSTEM = `You route requests for a task manager to worker agents.
Workers: taskkeeper (create or complete tasks), analyst (counts, lists, workload summaries), scheduler (suggest what to work on and in what order).
Reply with ONLY JSON: {"steps":[{"worker":"taskkeeper|analyst|scheduler","instruction":"<the part of the request for this worker>"}]}
Use at most ${MAX_STEPS} steps. If the request is unrelated to tasks, return {"steps":[]}.`;

async function livePlan(request) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: modelName(), max_tokens: 400, system: SYSTEM, messages: [{ role: 'user', content: request }] }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Anthropic API returned ${res.status}`);
  const data = await res.json();
  const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return validatePlan(JSON.parse(text.replace(/```json|```/g, '').trim()));
}

export async function planRequest(request) {
  const mode = modelMode();
  return span({ kind: 'model', name: `plan:${mode}`, input: { request, model: mode === 'live' ? modelName() : 'mock' } }, async () => {
    if (mode === 'live') {
      try {
        return { ...(await livePlan(request)), source: 'live' };
      } catch (err) {
        return { ...validatePlan(mockPlan(request)), source: 'mock-fallback', fallbackReason: err.message };
      }
    }
    return { ...validatePlan(mockPlan(request)), source: 'mock' };
  });
}
