# Mia Cognition Coordinator — Read-only Adapter Mapping (Draft)

Status: schema-audited design only. No adapter implementation, no row reads, no production integration.

Audit basis:
- Supabase project: `dbooikzqprnqbgpfwsze`
- Schema: `public`
- Inspection: table/column metadata only via the Supabase schema listing API.
- Runtime reference: `supabase/functions/mia-chat/index.ts` on the current default branch.
- No message, memory, emotion, relationship, personality, or event row contents were queried.

## 1. Adapter boundary

The future adapter is a separate, read-only projection. It must not be imported by `mia-chat`, must not receive a service-role key, and must not share credentials with any writer. It produces bounded coordinator input in memory and discards it after the shadow evaluation.

Hard prohibitions:
- No SELECT of `mia_messages.content`, `mia_memories.content`, life-event summaries/details, relationship context JSON, emotion trigger text/details, identity profile JSON, stable personality JSON, or personality state JSON.
- No raw names, message bodies, memory content, prompts, API keys, auth tokens, or user identifiers in output or diagnostics.
- No INSERT, UPDATE, DELETE, RPC, Storage operation, Edge Function invocation, message send, scene movement, or tool execution.
- No automatic promotion of coordinator output into memories, emotion events, relationship context, growth state, or evolution candidates.
- No use of the legacy/deleted `zhi-core` project or any unrelated Mia/MIA-02 identity.

## 2. Six-perspective mapping

The table below maps available schema fields to *potential metadata-only inputs*. “Candidate” does not mean authorized for runtime reads. Fields containing free text or arbitrary JSON are excluded unless a future separately reviewed transform can prove it emits only a narrow enum.

| Perspective | Existing source | Narrow candidate fields | Classification and limits |
|---|---|---|---|
| cognition | `mia_life_events` | `id` (pseudonymized), `event_type`, `occurred_at`, `source_table`, `source_record_id` (pseudonymized) | Event type/time are metadata, not proof of external truth. Summary/details excluded. |
| cognition | `mia_exploration_runs` | `id` (pseudonymized), `status`, `source_type`, `started_at`, `completed_at` | `virtual_simulation` is simulated/internal. `connected_world_data` remains unverified until source provenance is independently established. Observations/discoveries excluded. |
| emotion | `mia_emotion_events` | `emotion_type`, `intensity`, `valence`, `occurred_at` | Internal-state evidence only. Cannot establish external facts, another person's intent, or consent. Trigger summary/details excluded. |
| relationship | `mia_relationship_context` | `relationship_type`, `confidence`, `observed_at` | Internal relationship-context hint only; never evidence of consent or current intent. Names, agent IDs, and context JSON excluded. |
| motivation_action | `mia_forest_autonomy_runs` | `status`, `created_at`, `completed_at` | Historical execution metadata only. Planned action, planner reason, before/after state and details excluded. Must not cause a new action. |
| motivation_action | `mia_exploration_runs` | `status`, `source_type`, `started_at`, `completed_at` | Readiness/feasibility context only. No authority to travel or execute. |
| memory_time | `mia_memories` | `memory_type`, `importance`, `occurred_at`, `created_at` | Metadata can support temporal indexing only. Content, metadata JSON and source pointers excluded from the first adapter. |
| memory_time | `mia_life_events` | `event_type`, `occurred_at`, `created_at` | Temporal sequence only; summary/details excluded. |
| value_personality | `mia_identity` | No runtime fields in V1 | `identity_profile` and `stable_personality` are protected and excluded. Identity ID is a fixed adapter configuration constant, not a returned value. |
| value_personality | `mia_personality_state` | No runtime fields in V1 | Entire `state` JSON and its contents excluded. The existence/timestamp of state rows is also unnecessary for the first pass. |
| value_personality | `mia_growth_state_versions` | No runtime fields in V1 | State JSON and growth changes are protected; do not inspect or derive trait deltas. |
| value_personality | `mia_evolution_candidates` | No runtime fields in V1 | Candidate summaries, memory pointers, review state and release fields excluded; coordinator cannot create or approve evolution candidates. |

### Perspective completeness rule

The six reports are analytical views, not six independent data sources. Reusing one event in cognition, memory_time and motivation_action retains one original `source_id`; it never creates three evidence items. A report may be present with no eligible external evidence.

## 3. Provenance policy

The existing schema does not provide a universally reliable, machine-verifiable distinction between independently observed external facts and model-generated summaries. Therefore the adapter must default all unverified records to:

- `kind: "model_generated"`
- `scope: "internal_state"` unless a separately validated source contract proves otherwise.

Allowed evidence promotion:
1. `observed` is allowed only for a source with a documented capture mechanism, timestamp, source identity and integrity check.
2. `verified` requires a verification record from an independent trusted source; the current schema mapping alone does not establish this.
3. `model_generated` is always a hypothesis and is excluded from external-fact support.
4. `mia_emotion_events` and `mia_relationship_context` remain `internal_state`, regardless of confidence.
5. `mia_exploration_runs.source_type = "virtual_simulation"` must never be labelled a real-world observation.
6. `connected_world_data` is a provenance hint, not automatic verification.

Until a source-level provenance contract exists, the adapter must produce no `external_fact` evidence. The coordinator should consequently return `wait_for_evidence`, `ask_clarification`, or `shadow_only`, not manufacture a proposal.

## 4. Minimal metadata allowlist

Initial metadata projection may include only:
- perspective name;
- opaque, keyed-pseudonymized source reference;
- allowlisted enum value (where applicable);
- normalized timestamp;
- numeric bounded values already constrained by schema;
- source classification and provenance status.

Never emit raw database UUIDs. Use a keyed one-way pseudonym for deduplication, with the key held outside the database and never logged. If that key is unavailable, omit source references and mark provenance unknown rather than falling back to raw identifiers.

No raw content fields are permitted in V1 adapter output. Do not use arbitrary JSONB as a shortcut: JSONB fields may contain free text, identifiers, or prompt material.

## 5. Table-level disposition

| Table | V1 disposition | Reason |
|---|---|---|
| `mia_messages` | DENY | Contains private conversation content. No message-body reads. |
| `mia_memories` | METADATA ONLY | Content and metadata JSON denied; only bounded type/importance/time fields considered. |
| `mia_life_events` | METADATA ONLY | Summary/details denied; only event type/time/source classification considered. |
| `mia_emotion_events` | METADATA ONLY | Text and JSON denied; numeric affect cues remain internal-state only. |
| `mia_relationship_context` | METADATA ONLY | Names, IDs and context JSON denied; relationship type/confidence/time are weak internal hints. |
| `mia_identity` | DENY | Identity profile and stable personality protected. |
| `mia_personality_state` | DENY | Entire state JSON protected; no trait or emotion-state extraction. |
| `mia_growth_state_versions` | DENY | Growth state is protected and may contain mutable personality state. |
| `mia_evolution_candidates` | DENY | No candidate creation, review, approval, or release through coordinator. |
| `mia_forest_autonomy_runs` | METADATA ONLY | Execution trace content excluded; status/time only. |
| `mia_exploration_runs` | METADATA ONLY | Free-text observations and JSON discoveries excluded; simulation/world provenance kept explicit. |

All listed tables were observed with RLS enabled in the metadata audit. This is not a substitute for reviewing policies or proving that a future credential is read-only. RLS status alone does not grant or guarantee the intended adapter access.

## 6. Read-query and credential requirements for a future phase

Before any live shadow read:
1. Obtain separate explicit authorization for the exact table/column set and observation window.
2. Create/use a dedicated read-only database role or isolated read-only credential; never use the service-role key.
3. Confirm effective grants and RLS policies for that role. Do not infer security from `rls_enabled = true`.
4. Restrict queries to the fixed prototype Mia identity and a bounded time window; never query all identities.
5. Query only the metadata allowlist; no `SELECT *`, no free-text columns, no JSONB payloads.
6. Enforce row and time limits, query timeout, and a kill switch.
7. Keep results in memory only; no cache, logs, analytics events, or persistent shadow table.
8. Run coordinator against the existing synthetic fixture suite first; compare output with the baseline without changing Mia's reply.
9. Record only aggregate audit counters (query count, rows read, duration, denied-field test result), not row values or identifiers.

No production query or credential creation is authorized by this document.

## 7. Required tests before adapter implementation

Synthetic-only tests must prove:
- denied columns are absent from every query projection;
- no wildcard projection and no unbounded query;
- raw dialogue, names, UUIDs and arbitrary JSON never enter coordinator input;
- duplicate perspective summaries retain one source identity;
- simulation data cannot become external fact evidence;
- emotion and relationship hints cannot prove external facts or consent;
- unknown provenance produces no proposal;
- missing or conflicting evidence fails closed;
- all write/action flags remain false;
- adapter errors do not affect chat response or Mia runtime;
- kill switch returns an empty/unknown shadow result;
- no network/database client is bundled into the pure coordinator package.

## 8. Audit conclusion

The existing schema contains useful temporal and typed metadata for cognition, affect, relationship context, memory indexing and exploration history. It does **not** currently establish a safe general-purpose external-fact ledger. The first adapter should therefore be conservative and metadata-only; the value/personality perspective should be supplied by a fixed protected-baseline marker rather than reading mutable personality state.

This is a design artifact, not a live adapter. The current coordinator remains synthetic-only, and production Mia remains unchanged.


## 9. Adjacent audit note (not changed)

The inspected `mia-chat/index.ts` memory-ranking helper currently computes importance as `Number(row.importance || 0) / 100`, while the audited `mia_memories.importance` column has a database check constraint of `0 <= importance <= 1`. If the stored values follow the current schema, the helper reduces their contribution to a 0–0.01 range. Historical/imported rows may have different semantics, so this is a **potential scale mismatch**, not a confirmed production defect. Do not change it as part of this adapter work; first verify value conventions using a separately authorized, privacy-safe aggregate-only audit. The adapter must preserve the database's declared 0–1 scale and must not silently normalize by 100.
