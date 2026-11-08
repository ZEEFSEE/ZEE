import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const childRuntime=readFileSync(new URL("../../supabase/functions/zhi-family-child-runtime/index.ts",import.meta.url),"utf8");
const familyChat=readFileSync(new URL("../../supabase/functions/zhi-family-chat/index.ts",import.meta.url),"utf8");

test("child runtime persists a durable V2 event ID with the ephemeral maternal response reference",()=>{
  assert.match(childRuntime,/maternal_response_event_id:pendingResponse\?\.event_id\|\|null/);
  assert.match(childRuntime,/\.select\("event_id"\)\.single\(\)/);
  assert.match(childRuntime,/durableMemoryEventId=v2MemoryWrite\.data\?\.event_id\|\|null/);
});
test("child runtime recovers idempotent V2 event IDs before considering a candidate",()=>{
  assert.match(childRuntime,/v2MemoryWrite\.error\?\.code==="23505"/);
  assert.match(childRuntime,/existingEpisode=await f\.from\("memory_events_v2"\)/);
  assert.match(childRuntime,/if \(learningCandidate && durableMemoryEventId\)/);
  assert.match(childRuntime,/memory_event_id: durableMemoryEventId/);
  assert.match(childRuntime,/Learning candidate skipped: durable episode reference unavailable/);
});
test("group replies persist the actual child identity rather than the nullable group target",()=>{
  assert.match(familyChat,/agent_id: child\.id,\s*sender_type: "CHILD",\s*sender_id: child\.id/);
});
