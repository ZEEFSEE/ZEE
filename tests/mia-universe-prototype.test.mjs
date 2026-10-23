import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../mia-universe/index.html', import.meta.url), 'utf8');
const readme = await readFile(new URL('../mia-universe/README.md', import.meta.url), 'utf8');

test('standalone universe is a real WebGL/Three.js scene, not a ZHI map embed', () => {
  assert.match(html, /three@0\.169\.0\/build\/three\.module\.js/);
  assert.match(html, /new THREE\.WebGLRenderer/);
  assert.match(html, /OrbitControls/);
  assert.doesNotMatch(html, /SUPABASE_URL|service_role|createClient\s*\(|supabase\.co\/rest\/v1/i);
});

test('universe includes live rhythm and creation controls', () => {
  for (const id of ['addWorld', 'addMoon', 'addRing', 'addLife', 'pulse', 'rhythm', 'energy']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing control ' + id);
  }
  assert.match(html, /requestAnimationFrame\(animate\)/);
  assert.match(html, /Math\.sin\(t\*speed/);
});

test('agent proposals require Mia approval before a world entity is created', () => {
  assert.match(html, /id="submitProposal"/);
  assert.match(html, /status:'pending'/);
  assert.match(html, /Mia 批准并建造/);
  assert.match(html, /proposal\.status='approved'/);
  assert.match(html, /proposal\.status='rejected'/);
  assert.match(html, /inhabitants\.push\(name\)/);
  assert.match(html, /schema_version:2/);
});

test('local snapshot persistence is present and limits are documented', () => {
  assert.match(html, /localStorage\.setItem\('mia-independent-universe-v1'/);
  assert.match(html, /localStorage\.getItem\('mia-independent-universe-v1'/);
  assert.match(readme, /not yet connected to Mia's AI decision-making/);\n  assert.match(readme, /Mia-reviewed construction queue/);
  assert.match(readme, /does not read or write ZHI Core/);
});
