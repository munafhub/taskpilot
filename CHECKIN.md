# Async check-in (draft)

**Done this week**
- Scaffolded the repo: Express API, React client, shared tool registry, JSON-file store
- Built a custom MCP server (resource `taskpilot://tasks` and four tools) and a custom client; added `.mcp.json` for Claude Code
- Built a supervisor + three workers (taskkeeper, analyst, scheduler) with a mock planner and a validated live-model planner
- Added a tracing layer that records every agent, model, tool and MCP call to one log, with a waterfall view in the UI
- `npm run smoke` runs the whole stack end-to-end on mock data and passes

**Next**
- Get the proposal approved
- Run live-model routing with a real key and review the traces
- Add API route tests

**Blockers / questions**
- Is JSON-file storage fine for Phase 3?
- _(add anything you hit while running it)_
