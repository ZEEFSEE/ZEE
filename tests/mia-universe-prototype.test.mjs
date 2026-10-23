import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateProposal, reviewProposal } from '../mia-universe/governance.mjs';

const html = await readFile(new URL('../mia-universe/index.html', import.meta.url), 'utf8');
const readme = await readFile(new URL('../mia-universe/README.md', import.meta.url), 'utf8');

test('standalone universe is a real WebGL/Three.js scene, not a ZHI map embed', () => {
  assert.match(html, /three@0\.169\.0\/build\/three\.module\.js/);
  assert.match(html, /new THREE\.WebGLRenderer/);
  assert.match(html, /OrbitControls/);
  assert.doesNotMatch(html, /SUPABASE_URL|service_role|createClient\s*\(|supabase\.co\/rest\/v1/i);
});

test('inline Three.js module parses as JavaScript', () => {
  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match, 'missing module script');
  const source = match[1].replace(/^import .*;\s*$/gm, '');
  assert.doesNotThrow(() => new Function(source));
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
  assert.match(html, /Mia 审核并批准/);
  assert.match(html, /proposal\.status='approved'/);
  assert.match(html, /proposal\.status='rejected'/);
  assert.match(html, /inhabitants\.push\(name\)/);
  assert.match(html, /schema_version:2/);
});

test('governance policy rejects malformed proposals and duplicate submissions', () => {
  const base = { id: 'p1', schema_version: 1, agent: 'Agent A', kind: 'world', description: 'Quiet forest home', position: [10, 0, 10], status: 'pending' };
  assert.equal(validateProposal(base, { objects: [], proposals: [] }).ok, true);
  assert.equal(validateProposal({ ...base, kind: 'unknown' }, { objects: [], proposals: [] }).ok, false);
  const duplicate = { ...base, id: 'p2' };
  assert.equal(validateProposal(duplicate, { objects: [], proposals: [base] }).ok, false);
  assert.equal(reviewProposal({ ...base, description: '' }, { objects: [], proposals: [] }).decision, 'revision_required');
});

test('governance policy blocks spatial collisions and enforces entity cap', () => {
  const base = { id: 'p1', agent: 'Agent A', kind: 'moon', description: 'A small moon', position: [1, 0, 1], status: 'pending' };
  const nearObject = { kind: 'world', group: { position: { x: 1.2, y: 0, z: 1.2 } } };
  assert.equal(validateProposal(base, { objects: [nearObject], proposals: [] }).ok, false);
  const farProposal = { ...base, position: [20, 0, 20] };
  assert.equal(validateProposal(farProposal, { objects: Array.from({ length: 100 }, () => ({ kind: 'world' })), proposals: [] }).ok, false);
});

test('local snapshot persistence is present and limits are documented', () => {
  assert.match(html, /localStorage\.setItem\('mia-independent-universe-v1'/);
  assert.match(html, /localStorage\.getItem\('mia-independent-universe-v1'/);
  assert.match(readme, /not a live Mia AI judgment/);
  assert.match(readme, /Mia-reviewed construction queue/);
  assert.match(readme, /does not read or write ZHI Core/);
});
