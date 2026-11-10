import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.match(html, /data-lang="zh"/, "Chinese language toggle must exist");
assert.match(html, /data-lang="en"/, "English language toggle must exist");
assert.match(html, /consentToPublication|publish-consent/, "Publication consent must exist");
assert.match(html, /does not send or store|不会发送或保存/, "Preview must clearly disclose that it does not submit");
assert.match(html, /addEventListener\('submit'/, "Form must have an explicit safe submit handler");
assert.doesNotMatch(html, /fetch\s*\(|XMLHttpRequest|sendBeacon/, "Preview must not transmit visitor content");
assert.doesNotMatch(html, /AGNES_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/, "No server secrets may appear in frontend");
assert.match(html, /Mia's Echoes|Mia 的回声/, "Public archive section must exist");
console.log("Echo Mailbox preview checks passed.");
