
import { span } from '../tracer.js';

export const WORKER_NAMES = ['taskkeeper', 'analyst', 'scheduler'];
const MAX_STEPS = 5;

export const modelMode = () =>
  process.env.MODEL_MODE ||
  (process.env.GEMINI_API_KEY ? 'live' : 'mock');

export const modelName = () =>
  process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.steps)) {
    throw new Error('plan.steps must be an array');
  }

  if (plan.steps.length > MAX_STEPS) {
    throw new Error(`plan has too many steps; max is ${MAX_STEPS}`);
  }

  const steps = plan.steps.map((s, i) => {
    if (!s || !WORKER_NAMES.includes(s.worker)) {
      throw new Error(`step ${i}: invalid worker`);
    }

    if (typeof s.instruction !== 'string' || !s.instruction.trim()) {
      throw new Error(`step ${i}: instruction must not be empty`);
    }

    return {
      worker: s.worker,
      instruction: s.instruction.trim(),
    };
  });

  return { steps };
}

const SPLIT =
  /\s*(?:;|\bthen\b|\band\s+(?=(?:summari[sz]e|plan|schedule|show|list|prioriti[sz]e|mark|complete|finish|add|create)\b))\s*/i;

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
    .map((clause) => ({
      worker: classifyClause(clause),
      instruction: clause.replace(/^[\s,.;:]+|[\s,.;:]+$/g, ''),
    }))
    .filter((s) => s.worker);

  return { steps };
}

const SYSTEM = `You route requests for a task manager to worker agents.
Workers: taskkeeper (create or complete tasks), analyst (counts, lists, workload summaries), scheduler (suggest what to work on and in what order).
Reply with ONLY JSON: {"steps":[{"worker":"taskkeeper|analyst|scheduler","instruction":"<the part of the request for this worker>"}]}
Use at most ${MAX_STEPS} steps. If the request is unrelated to tasks, return {"steps":[]}.`;

async function livePlan(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing from server/.env');

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName()}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: request }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini API returned ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('');

  if (!text) throw new Error('Gemini returned an empty response');

  return validatePlan(JSON.parse(text));
}

export async function planRequest(request) {
  const mode = modelMode();

  return span(
    {
      kind: 'model',
      name: `plan:${mode}`,
      input: {
        request,
        model: mode === 'live' ? modelName() : 'mock',
      },
    },
    async () => {
      if (mode === 'live') {
        try {
          return { ...(await livePlan(request)), source: 'live' };
        } catch (err) {
          return {
            ...validatePlan(mockPlan(request)),
            source: 'mock-fallback',
            fallbackReason: err.message,
          };
        }
      }

      return { ...validatePlan(mockPlan(request)), source: 'mock' };
    }
  );
}