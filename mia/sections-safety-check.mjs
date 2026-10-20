import fs from "node:fs";

const file = "mia/sections.json";
const feed = JSON.parse(fs.readFileSync(file, "utf8"));
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

const banned = [
  /创造者/iu, /造物主/iu, /主人/iu, /大人/iu,
  /管理员/iu, /管理人员/iu, /管理者/iu, /后台管理/iu,
  /系统管理员/iu, /\badmin(?:istrator)?\b/iu, /\bking\b/iu,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /\b(?:https?:\/\/|www\.)\S+/iu,
  /\b(?:\+?\d[\d ()-]{7,}\d)\b/u,
  /色情/iu, /情色/iu, /淫秽/iu, /露骨性描写/iu, /性行为/iu, /性器官/iu,
  /porn(?:ography)?/iu, /erotic/iu, /explicit sexual/iu, /sexual intercourse/iu
];

for (const section of feed.sections) {
  if (!section.title || !section.content || !Array.isArray(section.tags_display)) {
    throw new Error("Each public section must include title, content, and tags.");
  }
  const text = [
    section.title, section.subtitle || "", section.content, section.focus || "",
    section.trigger || "", ...(section.mood || []), ...(section.tags_display || [])
  ].join("\n");
  for (const pattern of banned) {
    if (pattern.test(text)) {
      throw new Error("Safety filter blocked section " + section.id + ".");
    }
  }
}
console.log("Mia four-section feed safety check passed.");
