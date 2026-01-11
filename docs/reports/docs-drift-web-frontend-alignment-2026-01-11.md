# Docs Drift Report

Date: 2026-01-11
Scope: docs/specs/web/FULL-SPEC.md

## Changes Made
- docs/specs/web/FULL-SPEC.md: updated receipts to the latest local E2E run, clean result extraction, and WS event emission.
- docs/specs/web/FULL-SPEC.md: updated latest files list to include frontend alignment changes, message/checkpoint streams, and hardened index fix.

## Evidence
- src/api/server.ts: task-driven specialist auto-start and extractAgentResult
- src/db/mongo.ts: ensureIndexes drops legacy sandboxId_1
- web/src/App.vue: message polling via /api/messages
- web/src/api/client.ts: agents.list and messages.list
- web/src/types/index.ts: WS event payloads aligned to backend contract
- src/api/server.ts: message/checkpoint change streams emit message:new and checkpoint:new
- src/api/websocket.ts: emitNewMessage aligned to contract

## Open Questions / TODOs
- Should receipts pin a specific commit hash once changes are committed?

## Files Touched
- docs/specs/web/FULL-SPEC.md
- docs/reports/docs-drift-web-frontend-alignment-2026-01-11.md
