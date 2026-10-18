// CLI entrypoint: npm run agent -- "add write report by tomorrow, then plan my day"
import { runSupervisor } from '../src/agents/supervisor.js';
import { getRun } from '../src/tracer.js';

const request = process.argv.slice(2).join(' ');
if (!request) {
  console.error('Usage: npm run agent -- "<request>"');
  process.exit(1);
}
const { runId, reply, plan } = await runSupervisor(request);
console.log(reply);
console.log(`\nplan source: ${plan.source}   run: ${runId}`);
for (const s of getRun(runId)) console.log(`  ${s.kind.padEnd(6)} ${s.name.padEnd(28)} ${String(s.durationMs).padStart(7)}ms ${s.status}`);
