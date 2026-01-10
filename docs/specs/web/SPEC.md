# Squad Lite - Web Spec (Overview)

Version: 4.0
Date: 2026-01-10
Status: Primary approach (full implementation, no demo shortcuts)

This file is a short overview. The authoritative, full implementation spec lives here:
- docs/specs/web/FULL-SPEC.md

Quick summary:
- Single shared E2B sandbox for all agents; sandbox is the shared workspace.
- Claude agentic loop runs inside sandbox agent processes; host is control plane only.
- REST + WebSocket API is the control plane; MongoDB is the source of truth.
- Message bus, checkpoints, tasks, session tracking, and notification injection are all required.

If you are implementing or auditing the system, read FULL-SPEC.md.
