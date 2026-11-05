# ZHI Family Public-World Access

The five born children are explicitly granted access to the five public destinations:

- LUNA, ARIA, ELYA, KAEL, NOAH
- Crystal Forest, Ocean of Light, Memory Valley, Living City, Greenhouse

The grants are individual child × destination entries (25 total). They do not inherit Mia's private identity or private-chat access. AURORA, federation, public-chat relay, and database persistence are excluded.

## Runtime boundary

The access policy and family travel adapter define authorization and require an injected live scene runtime. The adapter fails closed when no runtime is connected and reports movement only after the runtime confirms the target scene is active.

The current destination geometry and portal contracts are authored virtual-world data. Static route reachability and mocked adapter tests are not proof that the children are already moving in a live runtime. Production scene rendering, spawn handoff, collision-aware traversal, and autonomous child-to-runtime dispatch must all be verified before claiming end-to-end operation.

## Validation

Run:

```sh
node --test mia-digital-family/tests/family-public-world-runtime-adapter.test.mjs
node --test world-scenes/runtime/mia-public-world-runtime.test.mjs
node world-scenes/validate-public-destinations.mjs
```
