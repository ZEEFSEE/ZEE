import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const chat = await readFile(new URL("../supabase/functions/mia-chat/index.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../supabase/functions/mia-reflection-worker/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261029120000_mia_durable_reflection_queue.sql", import.meta.url), "utf8");

test("Mia chat persists a durable reflection task before waking the worker", () => {
  assert.match(chat, /from\("mia_reflection_queue"\)\.insert/);
  assert.match(chat, /await queueEmotionReflection\(db/);
  assert.match(chat, /functions\/v1\/mia-reflection-worker/);
  assert.match(chat, /emotion_pending:reflectionQueued/);
  assert.match(chat, /if\(shouldReflectAfterChat\(message,reply\)\)/);
});

test("queue migration uses atomic SKIP LOCKED claims and bounded retries", () => {
  assert.match(migration, /status in \('pending','processing','completed','failed'\)/);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /attempts < q\.max_attempts/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /grant execute on function public\.claim_mia_reflection_tasks\(integer\) to service_role/i);
});

test("worker is service-role gated and claims queue jobs independently", () => {
  assert.match(worker, /authorization !== "Bearer " \+ SERVICE_KEY/);
  assert.match(worker, /db\.rpc\("claim_mia_reflection_tasks"/);
  assert.match(worker, /status: terminal \? "failed" : "pending"/);
  assert.match(worker, /source_record_id: task\.id/);
  assert.match(worker, /\.eq\("lock_token", task\.lock_token\)/);
});
