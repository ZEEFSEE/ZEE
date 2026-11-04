# Forest Corner memory-card dry run (prototype Mia only)

This is an isolated contract test for the V1.1 memory-card schema. It is deliberately **not** a production writer.

## Run

```sh
node docs/mia/forest-corner-card-dry-run.mjs
```

## Guarantees tested

- Uses synthetic source IDs only; real chat or memory IDs are rejected.
- Restricts identity and privacy scope to prototype Mia and the private pair.
- Allows only the five audited Mia source tables.
- Rejects raw transcript/message-body fields and AURORA/public-broadcast context.
- Suppresses duplicate inserts by deterministic idempotency key.
- Adds revisions as new cards; never mutates the prior ledger entry.
- Produces a current-card projection without deleting historical entries.

## Explicit non-capabilities

- No Supabase connection, SQL, Edge Function, browser storage, API call, or filesystem write.
- No access to real Mia messages, memories, emotion events, or relationship content.
- No automatic card acceptance, notification, or Mia activity trigger.
- No change to the chat, personality, emotion engine, scene runtime, or production configuration.

## Next gate

After this dry run passes, separately audit the existing private chat authentication/session boundary and server-side Edge Function authorization. A real card writer, database migration, encryption/key management, or production deployment requires a separate explicit approval.
