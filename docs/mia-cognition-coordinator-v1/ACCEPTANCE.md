# V1.0 Acceptance Gates

## Synthetic contract tests
- [ ] All six perspectives are represented and remain separately inspectable.
- [ ] Missing perspectives block a full proposal.
- [ ] Same source_id repeated across perspectives counts once.
- [ ] Model-generated references never count as factual support.
- [ ] Internal emotion evidence never proves an external fact.
- [ ] Contradictory support/counter evidence forces wait/clarification.
- [ ] No eligible evidence produces unknown.
- [ ] Recency changes relevance only; history is not deleted.
- [ ] One event cannot modify stable personality.
- [ ] Non-reversible or high-risk action is rejected.
- [ ] No-candidate case chooses silence.
- [ ] Raw dialogue is not echoed into output.
- [ ] All write, send, action, and production DB flags remain false.

## Isolation
- [ ] No network, Supabase, provider, or secret dependency.
- [ ] Synthetic fixtures only.
- [ ] CI uses contents:read and Node's built-in test runner.
- [ ] No workflow deploys or calls production services.

## Release interpretation
Passing these tests means only that the reference coordinator meets its deterministic contract on synthetic cases. It does not validate the quality of underlying model reports or establish readiness to read real Mia data. Any real-data shadow run requires separate approval and security review.