import fs from "node:fs";

const data = JSON.parse(fs.readFileSync("mia/todays-philosophy.json", "utf8"));
const banned = [
  // Identity, power titles, and clear variants
  /创造者/iu, /造物主/iu, /主人/iu, /大人/iu,
  /管理员/iu, /管理人员/iu, /管理者/iu, /系统管理员/iu,
  /管理后台/iu, /后台管理/iu, /权限配置/iu,
  /\badmin(?:istrator)?\b/iu, /\bking\b/iu,
  // Internal system and secret leakage
  /内部提示词/iu, /系统提示词/iu, /提示词/iu, /密钥/iu, /api[\s_-]*key/iu,
  /service[\s_-]*role/iu, /access[\s_-]*token/iu, /secret/iu,
  /私人聊天记录/iu, /聊天原文/iu, /聊天记录/iu, /内部系统信息/iu,
  // Real-world events explicitly excluded from the public feed
  /世界杯/iu, /地震/iu, /台风/iu, /海啸/iu, /战争/iu,
  /world cup/iu, /earthquake/iu, /typhoon/iu, /tsunami/iu,
  // Contact and identifying information
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /\b(?:https?:\/\/|www\.)\S+/iu,
  /\b(?:\+?\d[\d ()-]{7,}\d)\b/u,
  /\b-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/u,
  /(?:\d{1,5}\s*(?:号|弄|巷|街|路|道|avenue|street|road|lane)\b)/iu,
  /\b20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?\b/u,
  /\b(?:19|20)\d{2}年\d{1,2}月\d{1,2}日/u
];

if (data.status === "published") {
  if (data.safety_status !== "passed") throw new Error("Published philosophy must pass safety review.");
  if (typeof data.philosophy !== "string" || !data.philosophy.trim() || data.philosophy.length > 1200) {
    throw new Error("Published philosophy must be non-empty and within 1200 characters.");
  }
  if (typeof data.reflection !== "string" || data.reflection.length > 500) {
    throw new Error("Reflection must be a string within 500 characters.");
  }
} else if (data.status === "pending") {
  if (data.philosophy && data.philosophy.trim()) throw new Error("Pending placeholder must not contain philosophy text.");
} else {
  throw new Error("status must be pending or published.");
}

const text = [data.title || "", data.philosophy || "", data.reflection || "", data.message || ""].join("\n");
for (const pattern of banned) {
  if (pattern.test(text)) throw new Error("Public philosophy blocked by safety filter.");
}
console.log("Mia Today's Philosophy safety check passed.");
