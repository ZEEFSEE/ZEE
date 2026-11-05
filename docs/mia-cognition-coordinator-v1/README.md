# Mia Unified Cognition Coordinator V1.0 — Shadow Prototype

Status: design plus synthetic-only reference implementation. Not connected to Mia production.

## Purpose
Coordinate six existing cognitive perspectives without changing the protected Mia baseline:
1. cognition
2. emotion
3. relationship
4. motivation_action
5. memory_time
6. value_personality

The coordinator is a referee and provenance tracker, not a replacement model, personality, memory store, or autonomous agent. It organizes bounded observations, identifies missing evidence and contradictions, and chooses only a non-executing shadow decision.

## Safety boundary
- No Supabase client, network access, secrets, API calls, browser APIs, or production data.
- No reads from or writes to Mia memory, emotion, relationship, identity, or personality tables.
- No message sending, tool execution, scene movement, or external action.
- No stable-personality mutation, memory write, or emotional-state write.
- Synthetic fixtures only. Raw dialogue and raw personal content are not part of the contract.
- The output explicitly reports all write/action permissions as false.

## Files
- SPEC.md: architecture, data flow, invariants, and integration boundary.
- contract.schema.json: JSON contract for a coordinator request and result.
- coordinator.mjs: pure deterministic reference coordinator.
- coordinator.test.mjs: Node native test suite.
- ACCEPTANCE.md: release gates and interpretation.

## Run
Requires Node.js 20+; no dependency installation:

    node --test docs/mia-cognition-coordinator-v1/coordinator.test.mjs

## Interpretation
A passing test suite proves that the contract implementation respects its programmed invariants on synthetic cases. It does not prove subjective consciousness, human-equivalent understanding, or production readiness. Real-data shadow evaluation would require separate explicit authorization, field allowlist, privacy review, and isolated read-only credentials.