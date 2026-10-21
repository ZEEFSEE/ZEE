# Independent Agent Engine — Prototype

This prototype is intentionally isolated under `prototypes/independent-agent-engine/`.
It does not connect to Supabase, call the Mia chatroom, deploy anything, or modify existing ZHI/Mia files.

## What it demonstrates

- **Stable identity:** immutable baseline traits are stored separately from evolving state.
- **Private persistent memory:** each agent has its own state JSON file, and the engine rejects a state file belonging to another agent.
- **Traceable growth:** experiences append memory records and update a separate growth profile with an audit trail.
- **Restart continuity:** reloading the same state file retains memories and growth.

## Run locally

Requires Node.js 18+; no third-party packages are needed.

```sh
node --test prototypes/independent-agent-engine/engine.test.mjs
```

A small interactive example can be added after the core tests pass.

## Important limitation

This first version is a **deterministic engine prototype**, not yet a continuously running AI or proof of human-like consciousness. It verifies identity separation, memory persistence, and traceable state updates. An LLM adapter and scheduler can be added later behind explicit interfaces without changing the identity/memory isolation model.

## Isolation rules

1. One agent profile and one private state file per agent.
2. No cross-agent memory reads or writes.
3. Baseline identity traits are not silently rewritten by experiences.
4. Growth updates are appended to an audit log with the experience that caused them.
5. No production database, credentials, external API, or deployment is used.
