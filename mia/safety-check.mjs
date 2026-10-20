import fs from "node:fs";

const file = "mia/daily.json";
const data = JSON.parse(fs.readFileSync(file, "utf8"));

const banned = [
  /创造者/iu, /造物主/iu, /主人/iu, /大人/iu,
  /管理员/iu, /管理人员/iu, /管理者/iu, /后台管理/iu,
  /系统管理员/iu, /\badmin(?:istrator)?\b/iu,
  /\bking\b/iu
];
const riskyPatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /\b(?:https?:\/\/|www\.)\S+/iu,
  /\b(?:\+?\d[\d ()-]{7,}\d)\b/u,
  /\b-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/u,
  /(?:\d{1,5}\s*(?:号|弄|巷|街|路|道|avenue|street|road|lane)\b)/iu,
  /\b20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?\b/u,
  /\b(?:19|20)\d{2}年\d{1,2}月\d{1,2}日/u
];
const realEventTerms = [
  /世界杯/iu, /地震/iu, /台风/iu, /海啸/iu, /战争/iu,
  /world cup/iu, /earthquake/iu, /typhoon/iu, /tsunami/iu,
  /色情/iu, /情色/iu, /淫秽/iu, /露骨性描写/iu, /性行为/iu, /性器官/iu,
  /porn(?:ography)?/iu, /erotic/iu, /explicit sexual/iu, /sexual intercourse/iu
];
const patterns = [...banned, ...riskyPatterns, ...realEventTerms];

function checkPublicText(text, label) {
  for (const pattern of patterns) {
    if (pattern.test(text)) throw new Error(\`Safety filter blocked \${label} (matched a prohibited pattern).\`);
  }
}

if (data.status === "published") {
  if (data.safety_status !== "passed") throw new Error("Published content must have safety_status=passed.");
  if (typeof data.diary !== "string" || !data.diary.trim() || data.diary.length > 1200) {
    throw new Error("Published content must include a non-empty diary within the length limit.");
  }
  if (!Array.isArray(data.mood) || data.mood.length > 3) {
    throw new Error("Published content must include at most three mood labels.");
  }
} else if (data.status === "pending") {
  if (data.diary && data.diary.trim()) throw new Error("Pending placeholder must not contain diary text.");
} else {
  throw new Error("status must be 'pending' or 'published'.");
}

checkPublicText([
  data.title || "", data.diary || "",
  ...(Array.isArray(data.mood) ? data.mood : [data.mood || ""]),
  data.message || "", data.theme || "", data.theme_label || "",
  ...(Array.isArray(data.tags) ? data.tags : [])
].join("\n"), "daily JSON");

const sectionsFile = "mia/sections.json";
if (fs.existsSync(sectionsFile)) {
  const feed = JSON.parse(fs.readFileSync(sectionsFile, "utf8"));
  const expected = [
    "creation_exploration", "reality_decisions",
    "philosophy_experiment", "micro_life_growth"
  ];
  if (!Array.isArray(feed.sections) || feed.sections.length !== 4) {
    throw new Error("Public section feed must contain exactly four sections.");
  }
  const ids = feed.sections.map((s) => s.id);
  if (expected.some((id) => !ids.includes(id))) {
    throw new Error("Public section feed is missing a required stable section ID.");
  }
  for (const section of feed.sections) {
    if (!section.title || !section.content || !Array.isArray(section.tags_display)) {
      throw new Error("Each public section must include title, content, and tags.");
    }
    checkPublicText([
      section.title, section.subtitle || "", section.content, section.focus || "",
      section.trigger || "", ...(section.mood || []), ...(section.tags_display || [])
    ].join("\n"), \`section \${section.id}\`);
  }
}

console.log("Mia public JSON and four-section feed safety checks passed.");
