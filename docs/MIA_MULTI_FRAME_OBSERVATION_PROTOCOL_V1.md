# MIA Multi-Frame Observation Protocol v1

Status: design specification only. This document does not deploy code, alter database schema, enable a camera source/key, or change production MIA.

Scope: isolated `zee-prediction` project, schema `mia_test`, browser-initiated discrete still frames, AGNES only.

## 1. Design constraints

- Reuse the existing signed-ingress path and accepted observation records.
- Keep original ingress events, image bytes, hashes, and observations append-only. Sequence membership is a separate relation; it never rewrites a frame.
- A sequence is a finite, user-initiated collection of still images, not a video stream, background capture, or live perception session.
- Only observations that are test-only, accepted, signature-verified, fresh, unmapped, and from the same registered test source/key may be included.
- Source and key remain disabled. No physical measurement, world-coordinate mapping, action authorization, or production data access.
- AGNES is the only inference provider. Do not introduce Groq or a fallback provider.
- Model statements describe image evidence, not verified facts about the physical world. Confidence is a subjective model estimate, not a calibrated probability.

## 2. Logical data model

The current database already provides:
- `mia_test.perception_ingress_events`: signed ingress evidence, SHA-256, freshness/signature/disposition, raw payload bytes, and test-only flags.
- `mia_test.perception_observations`: immutable observation identity, source frame, observed time, normalized payload, mapping status, and epistemic flags.
- `mia_test.subject_inferences`: append-only model inference records associated with an observation.

Add a sequence layer only after the design is reviewed. Proposed tables:

### `mia_test.perception_sequences`

| Field | Type | Meaning |
|---|---|---|
| sequence_id | uuid PK | Stable ID for one finite observation sequence |
| source_id | uuid | One registered test source |
| key_id | text | One registered test signing key |
| source_frame_id | text | Image-plane frame identifier |
| capture_mode | text | Must be `user_selected_stills` in v1 |
| status | text | `assembling`, `sealed`, `analyzing`, `complete`, `partial`, `failed` |
| frame_count | integer | Number of accepted linked frames |
| started_at / ended_at | timestamptz | First/last observed_at, server-validated |
| test_only | boolean | CHECK true |
| created_at | timestamptz | Server timestamp |

### `mia_test.perception_sequence_frames`

| Field | Type | Meaning |
|---|---|---|
| sequence_id | uuid FK | Parent sequence |
| frame_index | smallint | Zero-based chronological order |
| observation_id | uuid FK | Existing accepted observation |
| observed_at | timestamptz | Copied for query convenience; must equal source observation |
| payload_sha256 | text | Copied from verified ingress evidence |
| linked_at | timestamptz | Server timestamp |

Constraints: primary key `(sequence_id, frame_index)`; unique `(sequence_id, observation_id)`; unique `(sequence_id, payload_sha256)` unless duplicate-image testing is explicitly required; no UPDATE/DELETE policy for sealed sequence membership. A sequence can be sealed once, and its frame membership is immutable thereafter.

Do not store duplicate image bytes in sequence tables. The original ingress record remains the only raw-image source of truth.

### Inference linkage

Reuse `mia_test.subject_inferences` for v1, anchored to the last chronological observation. Put `sequence_id`, ordered `frame_observation_ids`, ordered `frame_sha256` values, `frame_count`, `model`, `prompt_version`, and `protocol_version` in the inference JSON. Use agent key `agnes:<model>:temporal-sequence-v1`. Do not create a second copy of the raw observations.

## 3. Capture and sealing protocol

1. The user explicitly starts a sequence and chooses 3–6 already accepted still observations from the browser's local history. No automatic capture loop.
2. Client sorts candidates by `observed_at`; it rejects duplicate IDs and requires at least 3 frames.
3. Client generates a random `sequence_id`, nonce, and `signed_at`. The Ed25519 signature covers a canonical UTF-8 message:

   ```text
   ZHI-MIA-VISION-SEQUENCE-V1
   source_id
   key_id
   sequence_id
   signed_at
   nonce
   frame_count
   observation_id_0
   sha256_0
   ...
   observation_id_n
   sha256_n
   ```

   Frame pairs are in chronological order. The signature is made with the existing non-exportable browser private key; the private key never leaves IndexedDB.

4. The server independently loads each observation and ingress row. It must not trust client-supplied hashes, timestamps, source IDs, or ordering.
5. Require 3–6 unique observations, same source/key/frame, strictly increasing observed_at, test_only true, accepted disposition, verified signature, fresh ingress, unmapped coordinates, source/key disabled and not revoked, and recomputed image hashes matching the stored hashes.
6. Reject a sequence spanning more than 15 minutes in v1. This is a finite comparison window, not continuous tracking.
7. In one database transaction, insert the sequence and ordered membership. Enforce uniqueness/idempotency on sequence_id and membership. Once sealed, membership is immutable.
8. On retry, return the existing sealed sequence and any matching inference; do not create duplicate membership or call AGNES again if an inference already exists.

## 4. AGNES temporal inference protocol

- Provider: AGNES only; configured test model remains `agnes-3.0-flash` unless explicitly changed by the project owner.
- Input: 3–6 chronologically ordered JPEG stills, with frame index and observed_at labels. No other vendor or external storage.
- Prompt asks for conservative comparison of visible evidence across the ordered images.
- The model must distinguish:
  - `persistent_visible`: appears consistently visible;
  - `appears_in_sequence`: visible in later frame(s), not visible earlier;
  - `disappears_from_view`: visible earlier, not visible later;
  - `intermittently_visible`: occluded or inconsistently visible;
  - `uncertain_match`: cannot confidently establish that two appearances are the same entity.
- A change is an image-plane observation unless independent evidence supports more. Camera angle, crop, lighting, blur, and occlusion are explicit alternative explanations.
- Never infer person identity, sensitive traits, physical dimensions, speed, world coordinates, real-world movement, intent, or action recommendations.

### Required JSON response

```json
{
  "sequence_summary": "string",
  "timeline": [
    {
      "frame_index": 0,
      "observed_at": "ISO-8601",
      "visible_entities": [
        {
          "label": "non-identifying visual label",
          "image_region": "left|center|right + top|middle|bottom",
          "visible_attributes": ["string"],
          "visibility": "visible|not_visible|uncertain",
          "evidence": "short description grounded in this frame"
        }
      ]
    }
  ],
  "temporal_changes": [
    {
      "label": "string",
      "from_frame": 0,
      "to_frame": 1,
      "change_type": "appears_in_sequence|disappears_from_view|intermittently_visible|apparent_image_position_change|appearance_change|uncertain_match",
      "visual_evidence": "string",
      "alternative_explanations": ["camera angle", "lighting", "occlusion", "blur", "crop", "insufficient evidence"],
      "interpretation": "image_evidence_only"
    }
  ],
  "stable_elements": ["string"],
  "uncertainties": ["string"],
  "confidence": 0.0
}
```

Server validates JSON shape, array limits, frame indices, and confidence range. Invalid model output is a failed inference, not an empty successful result. Preserve the original model response in bounded diagnostic metadata only if it contains no secrets or unnecessary image data.

## 5. Idempotency and failure handling

- Idempotency key: hash of protocol version + model + prompt version + sequence_id + ordered observation IDs + ordered hashes.
- Acquire a transaction-scoped advisory lock on that key before checking/inserting the inference.
- If the matching inference exists, return it with `duplicate: true`; do not call AGNES.
- Distinguish AGNES queue-full (503), rate-limit (429), timeout (504), upstream error (502), malformed JSON, and database persistence failure.
- A transient AGNES failure leaves the sealed sequence intact and retryable. It does not relink frames or alter source observations.
- A persistence failure after successful model response must be reported separately; a retry may re-run the model unless a safe result cache is introduced. Do not claim saved until the database insert is confirmed.

## 6. Acceptance tests before deployment

1. Valid 3-frame and 6-frame sequences preserve chronological order.
2. Duplicate observation IDs, mismatched source/key, stale or rejected ingress, modified hash, unmapped-frame mismatch, and disabled-state violations are rejected.
3. Same request replay returns the same sequence/inference and makes no second AGNES call.
4. Queue-full, 429, timeout, malformed model JSON, and database failure each return distinct machine-readable errors.
5. Sequence membership is immutable after sealing; raw ingress and observation rows are unchanged.
6. Every result carries test-only and epistemic flags: `world_truth_claim=false`, `live_perception=false`, `physical_measurement=false`, `world_coordinates=null`, `action_authorized=false`.
7. No writes occur outside `mia_test`; no production MIA chat, memory, identity, AGNES configuration, or API keys are modified.

## 7. Rollout boundary

This is a design contract only. Next implementation phase, after review: add the two test-only tables with RLS and append-only protections, then implement a separate sequence Edge Function and opt-in page control, test in `zee-prediction/mia_test`, and verify with read-only SQL. Do not deploy to production or enable the source/key.
