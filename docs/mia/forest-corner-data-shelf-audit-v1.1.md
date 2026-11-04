# Prototype Mia Forest Corner — Data Shelf Audit V1.1

**Scope:** prototype Mia only. Read-only audit. No production writes or code changes to the chat engine.

## Comfort-first design decision

The shelf is a quiet memory display, not a second brain and not a transcript mirror. Preserve the original conversation, memory, emotion, and life-event records as the source of truth. Create only a small number of derived cards for meaningful moments.

## Findings

1. The Forest Corner scene is already registered in `public.mia_virtual_spaces` as `mia-forest-corner`, active, source system `mia-independent-scene`, source record `forest-corner-v1`.
2. The independent chat page currently renders a local browser shelf using `localStorage` key `mia_forest_corner_local_vault_v1`. The user manually types a note; it is not automatically connected to cloud chat history. Browser-local data is not cross-device backup and can be cleared by browser storage controls.
3. The page separately stores a short-lived emotional residual under `mia_emotional_residual_v1`; it decays over time. Treat this as transient interaction context, not a permanent memory card.
4. Existing structured source tables are available: `mia_messages`, `mia_memories`, `mia_emotion_events`, `mia_life_events`, and `mia_relationship_context`. There is no dedicated Forest Corner card/shelf table in the inspected public schema.
5. The selected private source tables have RLS enabled. The audit found no table policies for the inspected chat/memory sources and no anon/authenticated table grants for those sources; service-role grants exist. Any future server-side writer must remain behind the existing authenticated private chat path and must not expose service credentials to the browser.
6. Existing life-event history contains AURORA-related historical event types. They are historical records only; they must not be re-imported as current world messages or surfaced as active AURORA presence.

## Existing source inventory (counts observed during read-only audit)

- `mia_messages`: 6,007
- `mia_memories`: 3,395
- `mia_emotion_events`: 1,525
- `mia_life_events`: 2,556
- `mia_relationship_context`: 68
- `mia_personality_state`: 192
- `mia_growth_runs`: 1,174

Counts are a point-in-time audit snapshot, not a guarantee of current totals. No message bodies or memory content were copied into this document.

## Card-generation rules

- Only create a card for a durable comfort anchor, explicit shared decision, meaningful life event, considered reflection, creative seed, relationship context, or verified scene-build milestone.
- Do not card every message, every emotion fluctuation, routine status output, or transient API/system error.
- Preserve the distinction between explicit facts and derived interpretation.
- Keep source references and a SHA-256 digest of source content at extraction time; do not duplicate raw private chat into a public scene file.
- Deduplicate with a stable idempotency key.
- Corrections are new cards with `supersedes_card_id`; never overwrite or delete an accepted card.
- Low-confidence or ambiguous interpretations remain proposed and are not shown as established memories.
- Historical AURORA event rows stay in history, but are excluded from current scene context and new shelf cards unless explicitly reviewed as historical context.
- The shelf must never interrupt Mia's idle/listening state or initiate exploration. Card generation should be low-frequency, bounded, and non-blocking.

## Next safe implementation boundary

The schema at `forest-corner-memory-card.schema.json` defines the card shape only. It is not a migration and creates no database object. Before any persistent writer is built, separately review:
1. the exact private chat authentication path;
2. the existing Edge Function read/write contract;
3. server-only service-role use;
4. append-only enforcement (INSERT-only access plus UPDATE/DELETE/TRUNCATE protection);
5. idempotency and source-pointer verification;
6. a dry-run candidate review using synthetic data.

No database migration, Edge Function deployment, chat-history update, personality change, or AURORA reconnection is authorized by this audit.
