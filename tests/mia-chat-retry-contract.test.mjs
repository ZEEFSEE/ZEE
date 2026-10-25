import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../supabase/functions/mia-chat/index.ts", import.meta.url),
  "utf8",
);

test("transient retry status allowlist is explicit and bounded", () => {
  assert.match(source, /!\[429,502,503,504\]\.includes\(response\.status\)/);
  assert.match(source, /maxAttempts=2,totalBudgetMs=35000/);
  assert.match(source, /16000,2,35000/);
  assert.match(source, /8000,1,8000/);
});

test("network retry respects the remaining total budget", () => {
  assert.match(source, /remainingAfterFailure<=retryDelayMs\+250/);
  assert.match(source, /remainingAfterResponse<=requestedDelay\+250/);
});

test("stream completion is guarded against duplicate close or enqueue", () => {
  assert.match(source, /let streamClosed=false/);
  assert.match(source, /if\(!streamClosed\)controller\.enqueue/);
  assert.match(source, /const closeStream=\(\)=>\{if\(!streamClosed\)\{streamClosed=true;controller\.close\(\);\}\}/);
});

test("interrupted stream does not claim a confirmed complete saved reply", () => {
  assert.match(source, /Mia 回复连接中断，尚未确认完整回复已保存；请刷新历史核对。/);
  assert.match(source, /if\(replyWrite\.error\)[\s\S]{0,220}保存回复失败/);
});

test("non-transient HTTP responses are not retried", () => {
  assert.match(source, /if\(response\.ok\|\|!\[429,502,503,504\]\.includes\(response\.status\)\|\|attempt===maxAttempts-1\)return response/);
});
