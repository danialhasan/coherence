# Docs Drift Report

Date: 2026-01-10
Scope: docs/specs/web/SPEC.md, docs/specs/web/FULL-SPEC.md, docs/ARCHITECTURE.ascii

## Changes Made
- docs/specs/web/SPEC.md: Converted to overview and pointer to FULL-SPEC.
- docs/specs/web/FULL-SPEC.md: Added authoritative full implementation spec (shared sandbox, host runner, complete APIs and events).

## Evidence
- Shared sandbox manager and runner: src/sandbox/manager.ts, src/sandbox/runner.ts
- Agentic loop + tools (host): src/sdk/runner.ts
- Notification injection helpers: src/coordination/context.ts
- API routes + WS broadcast: src/api/server.ts, src/api/websocket.ts
- Data schemas + indexes: src/db/mongo.ts
- WebSocket event schema: src/contracts/websocket.contract.ts
- UI event handling: web/src/App.vue
- Research: docs/research/E2B-INTEGRATION.md
- Project overview and web-first decision: CLAUDE.md

## Open Questions / TODOs
- Update sandbox_tracking model to single doc per sandbox with embedded agents array (current code uses one doc per agent).
- Align WS agent:output payload field to use content (UI + contract expect content).
- Decide authoritative runtime path: host runner vs in-sandbox runner; spec now assumes host runner.
- Add spawnSpecialist tool to tool_use loop and wire to API.

## Files Touched
- docs/specs/web/SPEC.md
- docs/specs/web/FULL-SPEC.md
- docs/reports/docs-drift-web-architecture-2026-01-10.md
