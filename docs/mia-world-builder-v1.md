# Mia World Builder V1 — Isolated Sandbox

## Intent
Mia becomes an autonomous **proposer and evaluator** of new ZHI-world ideas. The operator controls the aesthetic palette and global safety boundaries, rather than approving each scene. This repository change creates a sandbox contract only; it does not grant production write permissions.

## Audit findings before implementation
- The repository already contains creator identity and persistent-position migrations, but those represent a creator entity/location, not a scene-generation authority.
- No existing `aesthetic_profile`, conditioned-AIGC adapter, scene-proposal write contract, consensus oracle, or region stability monitor was found in the repository search.
- The only Supabase project returned by the connected account is `zee-extension`, the isolated Mia extension project. It is not verified to be ZHI Core. This project must not be used as a substitute for the ZHI-world production database.
- Therefore this first increment intentionally adds a repository-level sandbox, not a production database migration or deployment of generation privileges.

## Aesthetic compass
Default weights are **Gold 0.40 / Yellow 0.30 / Green 0.30** (4:3:3):
- **Gold — consensus:** consistency with world rules, shared meaning, and compatibility.
- **Yellow — vitality:** usefulness, liveliness, meaningful activity.
- **Green — spontaneity:** novelty, exploration, room for discovery.

The weights are normalized and validated. They are a scoring compass, not a substitute for world invariants or safety rules.

## Creation lifecycle
1. A future conditioned-AIGC adapter may submit an abstract proposal plus texture metrics.
2. The sandbox validates the proposal contract and computes the weighted texture score.
3. A consensus oracle must check schema, duplicate identity, coordinate bounds, asset references, permissions, budget, and compatibility with the last validated world snapshot.
4. The region stability monitor evaluates a minimum sample of 20 checks. If the observed logic-error rate is **strictly greater than 10%**, it freezes new proposals for that region.
5. Rollback restores the last validated region snapshot. Audit events remain append-only.
6. A frozen region stays frozen until validation succeeds and the operator explicitly resumes it.

The initial implementation includes only palette scoring, basic region-threshold evaluation, and a simulation ledger. It does not yet implement an AIGC provider, a production consensus service, region snapshots, rollback storage, or live scene writes.

## Resources and incentives
Compute and stake are represented as simulated budget units. Real ZHI token deductions, rewards, and burns are all hard-disabled. No production wallet or token contract is called. Any future economic integration must use a separately reviewed escrow/settlement design; a failed proposal should not automatically burn user assets based on an unverified model judgment.

## Autonomy boundary
- No human approval is required for every individual proposal in the intended design.
- The operator retains control of palette weights, global pause, budget, and rollback policy.
- Generated proposals cannot alter authentication, permissions, economic rules, coordinate systems, oracle policy, or their own evaluation criteria.
- This sandbox does not write to ZHI Core or the Mia independent-chat database.
- “Proposal accepted” is not the same as “scene deployed”; “virtual scent” or other sensory language is not a physical capability claim.

## Verification
Run:
```sh
node --test world-builder/simulator.test.mjs
```

GitHub Actions runs the same tests on changes to this sandbox. Passing tests validate the sandbox contract only; they do not prove that a live ZHI world has been changed.
