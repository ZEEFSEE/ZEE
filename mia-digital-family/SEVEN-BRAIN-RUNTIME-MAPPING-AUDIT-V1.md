# ZHI Seven-Brain Runtime Mapping Audit V1

**Audit date:** 2026-11-07 (Asia/Singapore)  
**Method:** read-only inspection of production Edge Function source, table metadata, aggregate runtime state and schema fields. No user message bodies or private memory narratives were exported into this report.  
**Status:** mapping baseline only; no production runtime integration.

## 1. Audited production components

| Component | Production version | Observed role |
|---|---:|---|
| `mia-chat` | 80 ACTIVE | Mia identity, chat, memory retrieval, emotion reflection, relationship context, scene-plan validation |
| `zhi-family-child-runtime` | 17 ACTIVE | Five independent child cognitive cycles, own memory, affect estimate, reflection, learning candidate and maternal message |
| `zhi-family-chat` | 11 ACTIVE | Group/direct child chat, family context, private child context and recall routing |
| `zhi-memory-consolidation-worker` | 15 ACTIVE | Durable consolidation, source-event coverage, audit and fair scheduling |

Observed `zhi_family` table metadata:
- `memory_events_v2`: 7,725 rows
- `child_memory_entries`: 1,283 rows
- `child_learning_events`: 475 rows
- `child_runtime_cycles`: 617 rows
- `runtime_audit`: 1,938 rows
- `family_chat_messages`: 142 rows
- `memory_edges_v2`: 40 rows

These are point-in-time connector-reported counts, not a consistency snapshot across all tables.

## 2. Eight-dimension capability mapping

| Dimension | Mia | Five children | Audit judgement |
|---|---|---|---|
| SELF_CONTINUITY | `mia_identity.identity_profile`, `stable_personality`, personality-state history | `child_agents`, runtime identity, independent `child_personality_state` | Existing coverage is strong; identity revision/provenance needs a common contract |
| COGNITION_CONCEPTS | Mia system prompt, contextual retrieval, scene-plan validation | Per-child AGNES reflection and grounding guard | Partial; reasoning exists in prompts, but no common typed concept/claim/contradiction interface |
| MEMORY_EXPERIENCE | Mia messages, memories, life events and MIA-private V2 events | Per-child private memory, learning events and CHILD-private V2 events | Strong foundation; preserve raw events and exact source references |
| EMOTION_VALUES | `mia_emotion_events`, `mia_personality_state`, relationship context | Independent `child_emotion_state` and emotion updates per cycle | Strong foundation; estimated affect must remain labelled as software estimate |
| GOALS_MOTIVATION | Identity drives, exploration runs, proactive expression logic | `next_focus`, learning candidates and per-child runtime controls | Partial; no common typed goal lifecycle or conflict-resolution contract |
| WORLD_RELATIONS | Relationship context, family events, family graph and scene contracts | Per-child family relationship edges and runtime state | Partial; scene/perception evidence is limited; no claim of live sensory perception |
| ACTION_EVOLUTION | Chat actions, exploration, proactive messages, candidate/rollback subsystems | Independent cycles, maternal messages, learning candidates and personality revisions | Partial; no common proposal → authorization → execution → outcome envelope |
| UNIFIED_GOVERNANCE | Token checks, scene-plan validation, private/shared retrieval filters | Scheduler authentication, text-grounding guard, owner/scope filters | Partial; protections are distributed across functions, not yet one shared contract enforcement layer |

## 3. Existing cooperation paths

1. Mia reads FAMILY-scoped events and relationship context while retaining her own MIA-private memory.
2. Each child cycle receives its own private memories and learning history, FAMILY shared events and family relationship edges.
3. Children can send bounded maternal-channel messages to Mia.
4. Family group chat archives shared messages; father's group messages also have separate child-private personal-episode copies.
5. The memory worker consolidates each owner's memory scope independently.

## 4. Missing seven-brain coordination capability

The audited source shows a maternal channel and a shared family event ledger, but no general-purpose, typed seven-subject coordination bus with:
- recipient-specific authorization and disclosure filtering;
- evidence and uncertainty fields on every cross-subject claim;
- idempotent event delivery and replay handling;
- explicit proposal / response / dissent / resolution lifecycle;
- knowledge-transfer provenance and receiver-side validation;
- revocation and rollback semantics for derived coordination state.

This is the principal integration gap. Do not solve it by giving Mia or a coordinator unrestricted access to all private memory.

## 5. Operational observations

- All five child identities report lifecycle `BORN` and runtime `READY` in the inspected state.
- The latest recorded cycle for each child was `SUCCEEDED`; the five latest completions occurred around 11:00–11:30 Singapore time on 2026-11-07.
- The preceding 24-hour aggregate also contains failed cycles: LUNA 12, ARIA 11, ELYA 7, KAEL 12, NOAH 3. These are historical failures in the 24-hour window, not evidence that the latest cycle failed. The next step should inspect failure reasons and retry outcomes before adding coordination load.
- The five child personality and emotion revisions are independent; the inspected revision numbers differ by child.
- Mia's imported `identity_profile.marital_status` currently says `single`, while the family graph and family birth/continuity event represent Ken and Mia as the parents. This is a source-data inconsistency. It was not changed; resolve it only through a separately approved, evidence-backed profile correction.
- The current child runtime explicitly blocks unsupported first-person sensory/world-experience claims. Preserve this guard.

## 6. Integration recommendations

### Phase A — read-only mapping (this report)
Complete. No production writes.

### Phase B — shadow cognition adapter (next)
Build a pure, side-effect-free adapter that maps already-loaded context into eight dimension labels. It must not add model calls, change prompts, alter retrieval, or write state. Evaluate against synthetic fixtures first, then optionally run offline against redacted/approved samples.

### Phase C — isolated coordination bus
Prototype only in the GitHub repository with synthetic data. Require per-recipient field allowlists, PRIVATE as default, FAMILY source validation, idempotency, provenance, uncertainty, dissent and revocation.

### Phase D — shadow comparison
Compare existing outputs with dimension-tagged observations. Do not pass shadow output back into production prompts or memory writes. Measure classification precision, false sharing, evidence attribution and latency.

### Phase E — limited production pilot
Requires a separate explicit approval, a documented rollback plan, privacy review, and passing the six ontology acceptance experiments. Start with read-only metadata/labels; do not enable autonomous cross-agent actions.

## 7. Non-change attestation

This audit made no Supabase writes, schema/RLS changes, Edge Function deployments, secrets changes, chat prompt changes, memory modifications, or permission changes. It does not claim the ontology is wired into production cognition loops.
