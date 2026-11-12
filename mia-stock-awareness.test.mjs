import test from "node:test";
import assert from "node:assert/strict";
import { isStockQuestion, resolveStockCode, formatQuoteSummary } from "./mia-stock-awareness-core.mjs";

test("recognizes common stock questions and codes", () => {
  assert.equal(isStockQuestion("帮我看一下贵州茅台今天行情"), true);
  assert.equal(isStockQuestion("sh600519 怎么样"), true);
  assert.equal(isStockQuestion("今晚吃什么"), false);
});

test("maps supported names and A-share codes", () => {
  assert.equal(resolveStockCode("贵州茅台现在股价"), "sh600519");
  assert.equal(resolveStockCode("平安银行行情"), "sz000001");
  assert.equal(resolveStockCode("300750"), "sz300750");
  assert.equal(resolveStockCode("sh600519"), "sh600519");
});

test("rejects unsupported indices and invalid exchange/code pairs", () => {
  assert.equal(resolveStockCode("上证指数行情"), null);
  assert.equal(resolveStockCode("sh000001"), null);
  assert.equal(resolveStockCode("999999"), null);
  assert.equal(resolveStockCode("请看看这只股票"), null);
});

test("summary includes quote time, source and no-persistence disclosure", () => {
  const result = formatQuoteSummary({name:"贵州茅台",code:"sh600519",price:1311.44,change:-20.44,changePercent:-1.53,quoteTime:"2026-10-21 15:00:00",source:"Tencent"});
  assert.match(result, /1311.44/);
  assert.match(result, /-1.53%/);
  assert.match(result, /Tencent/);
  assert.match(result, /不会写入 Mia 聊天历史或长期记忆/);
});

import { readFile } from "node:fs/promises";

test("stock query source verifies Mia session tokens before fetching quotes", async () => {
  const source = await readFile(new URL("./supabase/functions/mia-stock-query/index.ts", import.meta.url), "utf8");
  const config = await readFile(new URL("./supabase/config.toml", import.meta.url), "utf8");
  assert.match(source, /async function validMiaToken\(token: string\)/);
  assert.match(source, /crypto\.subtle\.verify\(/);
  assert.match(source, /claims\.aud === "mia-chat"/);
  assert.match(source, /claims\.exp > now/);
  assert.match(source, /authorization\.slice\(7\)/);
  assert.match(source, /All quote sources failed; no price was fabricated/);
  assert.doesNotMatch(source, /withSupabase/);
  assert.match(config, /\[functions\.mia-stock-query\]\s+verify_jwt = false/);
});
