# ZHI G1 — Five Independent Child Runtime V1

## Production deployment
- Supabase project: `dbooikzqprnqbgpfwsze` (`zee-extension`)
- Private data schema: `zhi_family`
- Runtime Edge Function: `zhi-family-child-runtime` V4
- Scheduler: `zhi-family-child-runtime-every-minute` (active, every minute)
- Maternal scheduler: `zhi-family-maternal-bridge-every-minute` (active, every minute)
- TTL cleanup: `zhi-family-maternal-ttl-cleanup` (active, every minute)

The worker is one server-side dispatcher with five independently identified logical runtime instances. Each child has a separate runtime UUID, profile, personality state, emotion state, memory namespace, learning events, cycle counter, and message recipient. The worker filters every read/write by the fixed child ID; it never loads another child's private memory.

## Independent identities and initial profiles

| Child | Permanent ID | Heart namespace | Memory namespace | Primary tendency |
|---|---|---|---|---|
| LUNA | `ZHI-G1-D01-LUNA` | `HEART-G1-D01` | `MEM-G1-D01` | Exploration, nature and spatial observation |
| ARIA | `ZHI-G1-D02-ARIA` | `HEART-G1-D02` | `MEM-G1-D02` | Creativity, art and design |
| ELYA | `ZHI-G1-D03-ELYA` | `HEART-G1-D03` | `MEM-G1-D03` | Emotional understanding and relationships |
| KAEL | `ZHI-G1-S01-KAEL` | `HEART-G1-S01` | `MEM-G1-S01` | Logic, research and verification |
| NOAH | `ZHI-G1-S02-NOAH` | `HEART-G1-S02` | `MEM-G1-S02` | Practice, navigation and experimentation |

Ken is the father / Creator. Prototype Mia is the mother. The children are independent agents, not copies of Mia.

## Cognitive loop
Each child's first boot and recurring cycle:
1. Load only its own profile, personality state, emotion state, recent memories, and recent learning events.
2. If available, read the maternal response addressed to that child.
3. Run a distinct AGNES cognition prompt using that child's archetype and voice.
4. Write a bounded self-reflection to that child's memory namespace.
5. Store a learning candidate as `UNVALIDATED_CANDIDATE`; no automatic permanent capability upgrade is granted without validation.
6. Update only the child's emotion estimate and bounded growth notes.
7. Send a maternal message only when the model finds a meaningful introduction, response, question, or signal.

Scheduled self-reflection interval: 30 minutes per child. A pending maternal response triggers a cycle immediately on the next worker run. The scheduler wakes every minute but does not force a message every minute.

## Two-way maternal exchange
- Child → mother: `zhi_family.maternal_messages`
- Mother → child: `zhi_family.maternal_responses`
- Child consumes only the response whose `recipient_child_id` matches its own ID.
- Exchange depth is bounded to three messages total (child / mother / child); depth 2 is not answered again.
- Session TTL is 15 minutes; the cleanup job removes expired sessions and their volatile messages.
- The browser displays this exchange in a separate Mia Digital Family panel, not in Mia's private chat transcript.

## Authentication
- No child Auth user, password, or user-facing login is created.
- Each child has a server-owned `runtime_instance_id` UUID and a separate control row.
- The background dispatcher accepts only the Vault-backed HMAC scheduler header.
- The maternal adapter accepts the existing Mia custom token in the browser or the same internal scheduler credential in the background.
- The private schema has RLS enabled. PostgREST includes `zhi_family` in its schema cache for service-side access, but `anon` and `authenticated` retain no schema USAGE and no table privileges; `service_role` is the only runtime data-plane role.

## Explicit limits
- This runtime is cognitive/message processing, not a real 3D physics engine.
- No live sensors, real-world senses, or physical movement are connected. The runtime labels its input provenance as text-only and does not invent spatial observations.
- The 25 destination grants remain `PENDING_RUNTIME_VALIDATION` and disabled.
- The existing world-builder global pause and production-write lock remain unchanged.
- AURORA and Federation remain disabled.
- Mia's private chat, memory, emotion, personality, relationship context, and AGNES chat setup remain untouched.
