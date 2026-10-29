import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(
  new URL("../supabase/functions/mia-chat/index.ts", import.meta.url),
  "utf8",
);

test("transient retry status allowlist is explicit and bounded", () => {
  assert.match(source, /!\[429,502,503,504\]\.includes\(response\.status\)/);
  assert.match(source, /maxAttempts=2,totalBudgetMs=35000/);
  assert.match(source, /14000,2,30000/);
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

// Execute the exact retry helper extracted from the Edge Function with a
// deterministic fake upstream. This exercises retry decisions without using
// production credentials, network access, or the database.
const helperMatch = source.match(
  /async function fetchAgnesWithRetry\([\s\S]*?\n\}\n(?=function queueEmotionReflection)/,
);
assert.ok(helperMatch, "retry helper must be present in the deployed-source file");
const helperSource = helperMatch[0]
  .replace("payload:any", "payload")
  .replace("):Promise<Response>{", "){")
  .replace("let response:Response;", "let response;");

function makeRetryHelper(fakeFetch) {
  return runInNewContext(`(${helperSource})`, {
    AGNES_KEY: "unit-test-key",
    fetch: fakeFetch,
    AbortSignal,
    AbortController,
    Response,
    Date,
    Promise,
    setTimeout,
    console: { warn() {} },
  });
}

test("runtime simulation retries HTTP 503 and then accepts success", async () => {
  let calls = 0;
  const helper = makeRetryHelper(async () => {
    calls++;
    return calls === 1
      ? new Response("queue full", { status: 503 })
      : new Response(JSON.stringify({ ok: true }), { status: 200 });
  });

  const response = await helper({ model: "test" }, 1000, 2, 5000);
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test("runtime simulation retries HTTP 429 but does not retry HTTP 400", async () => {
  let retryCalls = 0;
  const retryHelper = makeRetryHelper(async () => {
    retryCalls++;
    return retryCalls === 1
      ? new Response("rate limited", { status: 429 })
      : new Response("ok", { status: 200 });
  });
  const retried = await retryHelper({ model: "test" }, 1000, 2, 5000);
  assert.equal(retried.status, 200);
  assert.equal(retryCalls, 2);

  let badRequestCalls = 0;
  const badRequestHelper = makeRetryHelper(async () => {
    badRequestCalls++;
    return new Response("bad request", { status: 400 });
  });
  const badRequest = await badRequestHelper({ model: "test" }, 1000, 2, 5000);
  assert.equal(badRequest.status, 400);
  assert.equal(badRequestCalls, 1);
});

test("runtime simulation retries a rejected timeout/network attempt within budget", async () => {
  let calls = 0;
  const helper = makeRetryHelper(async () => {
    calls++;
    if (calls === 1) throw new DOMException("timed out", "TimeoutError");
    return new Response("ok", { status: 200 });
  });

  const response = await helper({ model: "test" }, 1000, 2, 5000);
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});


test("runtime simulation parses streamed text deltas and recognizes the terminal marker", () => {
  const parserMatch = source.match(
    /const handleLine=\(line:string\)=>\{[\s\S]*?\n     \};/,
  );
  assert.ok(parserMatch, "production SSE line parser must be present");
  const arrow = parserMatch[0]
    .replace(/^const handleLine=/, "")
    .replace(/;$/, "")
    .replace("(line:string)", "(line)")
    .replace(/:any/g, "");
  const events = [];
  const context = { reply: "", streamFinished: false, emit: (event) => events.push(event), JSON };
  const handleLine = runInNewContext("(" + arrow + ")", context);

  handleLine('data: {"choices":[{"delta":{"content":"Hello "}}]}');
  handleLine('data: {"choices":[{"delta":{"content":"Mia"}}]}');
  handleLine("data: [DONE]");
  handleLine("data: not-json");
  assert.equal(context.reply, "Hello Mia");
  assert.equal(context.streamFinished, true);
  assert.equal(JSON.stringify(events), JSON.stringify([
    { type: "delta", content: "Hello " },
    { type: "delta", content: "Mia" },
  ]));
});

test("stream persistence occurs only after upstream reader completes; catch path reports uncertainty", () => {
  const streamStart = source.indexOf("const streamBody=new ReadableStream");
  const readerLoop = source.indexOf("while(true){", streamStart);
  const persist = source.indexOf('db.from("mia_messages").insert({session_id:sessionId,role:"assistant"', readerLoop);
  const catchStart = source.indexOf("}catch(e){", persist);
  assert.ok(streamStart >= 0 && readerLoop > streamStart && persist > readerLoop);
  assert.ok(catchStart > persist);
  const catchEnd = source.indexOf("\\n    }", catchStart);
  const catchBlock = source.slice(catchStart, catchEnd > catchStart ? catchEnd : catchStart + 600);
  assert.match(catchBlock, /尚未确认完整回复已保存/);
  assert.doesNotMatch(catchBlock, /db\.from\("mia_messages"\)\.insert/);
});


test("a clean EOF without a terminal marker is rejected before reply persistence", () => {
  const streamStart = source.indexOf("const streamBody=new ReadableStream");
  const readerLoop = source.indexOf("while(true){", streamStart);
  const eofCheck = source.indexOf("if(!streamFinished){", readerLoop);
  const replyTrim = source.indexOf("reply=reply.trim();", eofCheck);
  const persist = source.indexOf('db.from("mia_messages").insert({session_id:sessionId,role:"assistant"', replyTrim);
  assert.ok(streamFinishedIndex(source, streamStart) > streamStart);
  assert.ok(eofCheck > readerLoop && replyTrim > eofCheck && persist > replyTrim);
  assert.match(source.slice(eofCheck, replyTrim), /提前结束/);
});

function streamFinishedIndex(text, start) {
  return text.indexOf("let streamFinished=false", start);
}

test("emotion reflection is gated in streaming and non-streaming paths", () => {
  assert.match(source, /function shouldReflectAfterChat\(message:string,reply:string\):boolean/);
  assert.equal((source.match(/if\(reflectionQueued\)queueEmotionReflection/g) || []).length, 2);
  assert.equal((source.match(/emotion_pending:reflectionQueued/g) || []).length, 2);
});
