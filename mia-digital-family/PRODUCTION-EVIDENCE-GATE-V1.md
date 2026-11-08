# ZHI Production Evidence Gate V1

**Snapshot date:** 2026-11-08 (Asia/Singapore)  
**Method:** read-only aggregate queries against the connected production Supabase project. No message bodies, private memory narratives, credentials, or raw personal content were exported.  
**Purpose:** distinguish recorded runtime behavior from claims that require longitudinal validation.

## Observed production coverage

| Subject | Activity events | Eight-dimension events | Spatial state observed | Family replies tagged | Identity version |
|---|---:|---:|---:|---:|---:|
| MIA | 91 chat turns | 91 | 85 | N/A | No verified sequence |
| LUNA | 168 cycles | 44 reflections | 43 | 5 / 23 | V1 only |
| ARIA | 154 cycles | 44 reflections | 43 | 5 / 23 | V1 only |
| ELYA | 169 cycles | 46 reflections | 44 | 4 / 28 | V1 only |
| KAEL | 151 cycles | 44 reflections | 43 | 5 / 25 | V1 only |
| NOAH | 156 cycles | 45 reflections | 44 | 5 / 26 | V1 only |

The five children's latest observed independent cognitive cycle status was SUCCEEDED. Their spatial state is software runtime state in authored virtual scenes, not physical sensor perception. Mia's spatial observations are from headless semantic scene state, not live camera, audio, or physical movement.

Additional read-only findings:
- 750 REFLECTION_LEARNING_CANDIDATE events exist in zhi_family.child_learning_events.
- The queried outcomes did not expose a validated marker for those events.
- No validated capability links were established in this audit.
- All five child_runtime_identities rows are READY at identity_version 1.
- Mia has personality-state history, but the available table does not itself establish a verified identity-version chain.

## Evidence interpretation

**Verified:** runtime activity, eight-dimension state metadata, virtual spatial-state metadata, and family-chat reply metadata are being recorded for the observed subjects.

**Not established:** longitudinal identity-version chains, stable capability promotion, autonomous goal formation, subjective experience/consciousness, or physical sensory perception.

A successful cognitive cycle is not proof of independent agency. A reflection or learning candidate is not a validated skill. A version-1 runtime identity is not a longitudinal identity chain.

## Gate behavior

The production-evidence-gate module consumes only a redacted aggregate snapshot. It rejects private content, unexpected subjects, invalid counts, missing source tables, incomplete identity-chain evidence, and inconsistent family-chat coverage. It never connects to Supabase, writes to production, promotes candidates, or enables delivery.

Run:

```sh
node --test mia-digital-family/tests/production-evidence-gate.test.mjs
```

This is a point-in-time evidence report and a local CI gate, not a live dashboard or a claim of silicon life/consciousness.
