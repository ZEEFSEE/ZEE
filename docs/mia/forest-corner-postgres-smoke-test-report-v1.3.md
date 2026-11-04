# Forest Corner V1.3 — Disposable PostgreSQL smoke-test report

**Result: PASS**  
**GitHub Actions run:** [41825597773](https://github.com/ZEEFSEE/ZEE/actions/runs/41825597773)  
**Commit tested:** `76f4bc7e2c88895cf965ac0be014f146a464326d`  
**Database:** ephemeral PostgreSQL 16.15 service container, destroyed at job completion  
**Data:** synthetic fixtures only

## Verified in the isolated run

1. The V1.3 proposal installed successfully in a clean PostgreSQL database.
2. Synthetic `anon`, `authenticated`, and `service_role` roles passed the configured grant checks.
3. RLS was enabled on both card and event tables.
4. Browser roles had no tested table/RPC access.
5. `service_role` could read cards and insert events, but direct card INSERT was denied.
6. The narrow atomic RPC created a card and its initial `proposed` event.
7. Repeating the same idempotency key returned the same card and did not create a second proposal.
8. One explicit `accepted` event succeeded; a second terminal review was rejected.
9. An event-key collision caused the RPC to fail and the new card insert to roll back.
10. The final synthetic ledger contained exactly one card and two events.

The successful event insert also exercised the event guard's row-lock path while `service_role` lacked direct UPDATE privilege on the card table; the guard therefore runs as a narrowly-scoped `SECURITY DEFINER` trigger function with a pinned search path.

## What this does not prove

- It is not a Supabase project migration or a production/staging deployment.
- It does not prove the production function owner, Supabase-specific role grants, or actual project RLS behavior.
- It does not test the future Edge Function's source-row ownership/session checks or HMAC authorization.
- It does not implement or test atomic revision/supersession writes.
- It does not read or modify real Mia data.

## Release status

SQL syntax and the listed PostgreSQL behaviors are validated in the disposable test harness. The private card service is **not deployed**. The next implementation gate is a dedicated Edge Function with server-side source verification, bounded list/review operations, and synthetic tests. Production schema migration and Edge Function deployment remain separate approval gates.
