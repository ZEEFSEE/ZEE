import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

test("agent template is valid JSON and includes release gates", async () => {
  const agent = await readJson("../../agents/templates/agent.json");
  assert.equal(agent.schema_version, "1.0");
  assert.equal(agent.status, "draft");
  assert.match(agent.agent_id, /^REPLACE_WITH_/);
  assert.equal(agent.release_gates.authorization_tests, true);
  assert.equal(agent.release_gates.memory_quality_tests, true);
  assert.equal(agent.release_gates.cost_capacity_baseline, true);
});

test("permissions template is deny-by-default and grants no capabilities", async () => {
  const permissions = await readJson("../../agents/templates/permissions.json");
  assert.equal(permissions.default_policy, "deny");
  assert.deepEqual(permissions.allowed_data_scopes, []);
  assert.deepEqual(permissions.allowed_edge_functions, []);
  for (const [name, enabled] of Object.entries(permissions.capabilities)) {
    assert.equal(enabled, false, `capability must default to false: ${name}`);
  }
});

test("metrics template does not invent baseline measurements", async () => {
  const baseline = await readJson("./metrics-baseline.json");
  assert.equal(baseline.assessment, "unable_to_assess");
  assert.equal(baseline.observed_at_utc, null);
  assert.equal(baseline.limits.confirmed_limits_source, null);
  for (const [name, value] of Object.entries(baseline.metrics)) {
    if (Array.isArray(value)) continue;
    assert.equal(value, null, `metric must start unmeasured: ${name}`);
  }
});

test("prompt and memory policy files exist and contain required safety sections", async () => {
  const prompt = await readFile(new URL("../../agents/templates/system-prompt.md", import.meta.url), "utf8");
  const memory = await readFile(new URL("../../agents/templates/memory-policy.md", import.meta.url), "utf8");
  const personality = await readFile(new URL("../../agents/templates/personality.md", import.meta.url), "utf8");
  assert.match(prompt, /不得泄露密钥/);
  assert.match(prompt, /不确定时明确指出不确定性/);
  assert.match(memory, /幂等/);
  assert.match(memory, /来源/);
  assert.match(personality, /核心身份/);
});

test("acceptance checklist includes security, memory, metrics and rollback gates", async () => {
  const checklist = await readFile(new URL("./acceptance-checklist.md", import.meta.url), "utf8");
  for (const section of ["权限与隐私", "记忆与事件质量", "性能、容量与成本", "发布与恢复"]) {
    assert.ok(checklist.includes(section), `missing acceptance section: ${section}`);
  }
});
