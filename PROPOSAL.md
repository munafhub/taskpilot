# Phase 3 project proposal (draft for mentor approval)

**Project:** TaskPilot, an agent-driven task manager.

**Problem.** People keep tasks in one tool and plan their day in their head. Typing "add the report for tomorrow, then plan my day" should just work, and when an AI does something on your behalf you should be able to see exactly what it did.

**Solution.** A React + Express app with a task list and a text box. A supervisor agent splits each request and hands the parts to specialist workers (create/complete, analysis, scheduling). All actions go through a small set of tools that are also exposed over MCP, so Claude Code can drive the same app. Every agent, model and tool call is traced and visualised.

**Scope for Phase 3.**
- Task CRUD API and UI
- Supervisor + 3 workers using a live model for routing and validated structured output
- MCP server (tasks resource, four tools) and a custom client
- Trace viewer
- Tests that run on mock data

**Out of scope.** Accounts and auth, multi-user sync, mobile app, deployment hardening.

**Stack.** JavaScript, HTML, CSS, React (Vite), Express.js, Node 20+, JSON-file storage (database later if needed).

**Success criteria.**
1. `npm run smoke` passes with no API key.
2. Claude Code can add and list tasks through the MCP server.
3. A two-part request produces a trace with at least two workers and three tool calls.
4. A bad request or failing worker returns a clear message and does not crash the run.

**Risks.** Live-model routing can return invalid JSON (mitigation: schema validation and mock fallback). Cost grows with agent count (mitigation: one model call per request, deterministic workers).

**Questions for mentor.** Is JSON-file storage acceptable for Phase 3, or should I move to SQLite now?
