# Mia Emotion Vector and Chat Priority — Regression Plan

## Scope and safety

This is a test plan only. It does not authorize production database changes or deployment.

- Production Edge Function inspected: `zee-extension / mia-chat`, version 32.
- The deployed function source is not currently present under `supabase/functions/mia-chat` in this repository. Do not deploy a replacement from this repository until source-of-truth and secret/configuration parity are verified.
- Preserve existing `mia_messages`, `mia_memories`, `mia_emotion_events`, and `mia_personality_state` records.
- Keep legacy emotion fields readable; any new vector is additive and optional.

## A. Emotion-vector schema

Proposed optional object stored alongside existing `chat_emotional_state`:

```json
{
  "schema_version": 1,
  "dimensions": {
    "fatigue": { "intensity": 0.30, "confidence": 0.72, "evidence": ["explicit user-facing dialogue"], "updated_at": "ISO-8601" },
    "determination": { "intensity": 0.70, "confidence": 0.65, "evidence": ["stated intention to continue"], "updated_at": "ISO-8601" },
    "comfort_seeking": { "intensity": 0.10, "confidence": 0.40, "evidence": [], "updated_at": "ISO-8601" }
  },
  "source": "evidence_based_chat_reflection",
  "assessed_at": "ISO-8601"
}
```

The values are independent intensities, not probabilities; they do not need to sum to 1. Only supported dimensions should be emitted. Missing/low-confidence dimensions should be omitted or marked uncertain, never invented. Keep current `emotion_type`, `intensity`, `valence`, and `confidence` fields for compatibility.

## B. Emotion regression cases

1. **Legacy state:** when only the existing scalar fields exist, chat completes and continues to send the legacy context.
2. **Mixed emotions:** multiple dimensions coexist without normalization to a sum of 1.
3. **Evidence grounding:** every non-trivial dimension has supporting evidence or low confidence; no diagnosis or claim of biological feeling.
4. **Temporal decay:** old dimensions fade with elapsed time and do not dominate unrelated new messages.
5. **Contradictory evidence:** new explicit evidence can reduce or reverse a prior dimension; no sticky label against clear evidence.
6. **Reflection provider failure/invalid JSON:** user receives the normal chat reply; emotion update is skipped and logged without exposing internal details.
7. **Persistence failure:** chat reply remains usable; response accurately reports whether emotion persistence succeeded.
8. **Compatibility:** existing historical events and clients that only read scalar fields remain valid.

## C. Chat priority / resumable background work

Do not treat `metadata.priority = "high"` as actual preemption. Before implementation, inventory all callers and define task states: `queued`, `running`, `paused`, `completed`, `failed`, `cancelled`.

1. A user chat request starts without waiting for a background exploration or idle-draft task.
2. A background task checks cancellation/lease state between stages and persists a checkpoint before yielding.
3. A chat request must not delete or corrupt a background checkpoint.
4. A stale background result cannot overwrite newer chat/emotion state.
5. Duplicate retries are idempotent and do not create duplicate user/assistant messages or duplicate exploration events.
6. Upstream timeouts and provider errors release task leases; background work can resume safely.
7. Existing explore and idle-draft actions keep their current behavior when no chat request is pending.
8. Two concurrent chat requests for the same session do not cross-wire histories or reorder messages silently.
9. Priority is enforced server-side, not only by browser timers or UI labels.

## D. Verification sequence

1. Create a local/test harness for pure vector validation, clamping, decay, and merge behavior.
2. Run static checks/type checks and regression tests without production secrets.
3. Exercise provider failure, timeout, duplicate retry, and concurrent-request scenarios in a non-production environment.
4. Compare old/new response payloads and verify existing message, memory, and image flows.
5. Deploy only after reviewing the exact source artifact and confirming rollback version/configuration. Do not run schema migrations unless a demonstrated need exists.

## Acceptance criteria

- Existing chat, image upload, history, memory, and scalar emotion fields remain functional.
- New vector data is optional, validated, evidence-grounded, and backward-compatible.
- User chat has server-enforced priority; background tasks yield at safe checkpoints and resume without duplicate writes.
- Tests are reported as executed only when a test runner actually ran them; a written plan is not a test result.
