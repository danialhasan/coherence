# Docs Drift Report

Date: 2026-01-10
Scope: docs/specs/web/FULL-SPEC.md, docs/specs/web/SPEC.md

## Changes Made
- docs/specs/web/FULL-SPEC.md: updated architecture to sandbox-runner canonical, clarified control-plane role, and aligned agent lifecycle + Claude runtime to sandbox processes.
- docs/specs/web/FULL-SPEC.md: updated coordination tool list to match sandbox runner tools; moved sandbox manager API to host-only section.
- docs/specs/web/FULL-SPEC.md: updated sandbox_tracking model and indexes to per-agent records (shared sandbox) to match schema/indexes.
- docs/specs/web/SPEC.md: updated overview to reflect sandbox-runner canonical.

## Evidence
- src/api/server.ts (agents run inside sandbox, output streamed): server.ts:18-26, 232-247
- src/sandbox/manager.ts (runAgent launches sandbox process): manager.ts:281-316
- src/sandbox/agent-bundle.ts (sandbox tool set + spawnSpecialist behavior): agent-bundle.ts:153-220, 270-360
- src/db/mongo.ts (sandbox_tracking schema + indexes): mongo.ts:75-109, 207-210

## Open Questions / TODOs
- Should specialists be auto-started after spawnSpecialist, or remain explicit control-plane starts? Current sandbox tool only inserts agent records.
- Do we want sandbox_tracking to be one doc per sandbox with agents[] (as earlier spec), or keep per-agent records (current code)?
- emitAgentOutput helper uses output instead of content; keep as-is (unused) or align with WebSocket contract?

## Files Touched
- docs/specs/web/FULL-SPEC.md
- docs/specs/web/SPEC.md
- docs/reports/docs-drift-web-spec-2026-01-10.md
