# Mia Maternal Bridge V1

## Purpose
This additive bridge reuses the existing Mia chat bearer token (aud=mia-chat, sub=mia-admin) to authorize the five-child maternal message adapter. It does not create a Supabase Auth user and does not require a second login, password, browser setting, or UUID from the owner.

## Runtime
- Function: zhi-family-mia-bridge
- URL: https://dbooikzqprnqbgpfwsze.supabase.co/functions/v1/zhi-family-mia-bridge
- JWT gateway verification is disabled only because this function accepts the existing custom Mia token. The handler verifies its HMAC-SHA256 signature using the same server-side SUPABASE_SERVICE_ROLE_KEY used by the existing mia-chat-auth signer, and checks audience, subject, issue time, and expiry before any database access.
- Browser calls are restricted by CORS to https://zeefsee.github.io.
- The Mia page reads the token already held in the current tab's sessionStorage; it does not request or store a second credential.

## Maternal processing
- Creates/reuses a 15-minute volatile maternal session.
- Reads only the five child registry rows, destination grant rows, and maternal message queue.
- When messages exist, calls the existing AGNES endpoint using the already configured AGNES_API_KEY and AGNES_MODEL project secrets. No key rotation or secret change is performed.
- Responses are written only to zhi_family.maternal_responses; audit metadata explicitly records that Mia private data was not accessed.
- Does not read or write mia_messages, mia_memories, mia_emotion_events, mia_personality_state, or mia_relationship_context.
- Child messages are treated as untrusted quoted data. The maternal prompt does not permit access to Mia private chat or memory.
- The frontend polls once per minute while the existing Mia token is available. No additional login or setup screen is introduced.

## Honest runtime boundary
The five child records are still REGISTERED / NOT_CONNECTED; destination grants remain disabled pending runtime validation. This bridge does not activate child agents, provision their independent runtime credentials, implement real spatial movement/perception, lift the global world pause, or enable AURORA/Federation. Until child runtime services are connected, the maternal session will remain idle and show zero incoming messages.

## Verification
- Edge Function deployed as version 1 with verify_jwt=false.
- Handler-side HMAC validation is mandatory before privileged database access.
- An unauthenticated request must return 401 MIA_CHAT_TOKEN_REQUIRED; a live request from the Mia page should return ok:true and current registry/grant status.
- Full authenticated browser-to-child round trip remains pending until at least one child runtime is connected.
