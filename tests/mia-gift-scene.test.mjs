import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const scene = JSON.parse(await readFile(new URL('../mia/forest-corner.json', import.meta.url), 'utf8'));
const html = await readFile(new URL('../mia-chat.html', import.meta.url), 'utf8');

test('gift is linked to an active scene entity using local coordinates', () => {
  const gift = scene.gift;
  assert.equal(gift.status, 'delivered_in_virtual_scene');
  assert.equal(gift.location.scene_slug, scene.slug);
  const entity = scene.entities.find(item => item.id === gift.location.entity_id);
  assert.ok(entity, 'gift anchor entity must exist');
  assert.equal(entity.status, 'active');
  assert.equal(gift.location.x, entity.x);
  assert.equal(gift.location.y, entity.y);
  assert.ok(gift.location.x >= 0 && gift.location.x <= scene.local_coordinate_system.width);
  assert.ok(gift.location.y >= 0 && gift.location.y <= scene.local_coordinate_system.height);
  assert.equal(gift.location.coordinate_system, 'Forest_Corner local coordinates');
});

test('three-color bouquet contains exactly nine roses and is virtual-only', () => {
  const flowers = scene.gift.flowers;
  assert.deepEqual(flowers.map(f => f.color), ['red', 'yellow', 'white']);
  assert.deepEqual(flowers.map(f => f.count), [3, 3, 3]);
  assert.equal(flowers.reduce((sum, f) => sum + f.count, 0), 9);
  assert.equal(scene.gift.scent.mode, 'virtual_scent_imagery');
  assert.match(scene.gift.scent.note, /Textual\/visual simulation only/);
});

test('chat page renders gift fields from the scene manifest rather than hardcoded rose text', () => {
  for (const id of ['roseGiftArt', 'roseGiftTitle', 'roseGiftCounts', 'roseGiftMessage', 'roseGiftScent', 'roseGiftLocation']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing UI anchor ' + id);
  }
  assert.ok(html.includes('fetch("./mia/forest-corner.json?v=2"'));
  assert.ok(html.includes('gift.location.entity_id'));
  assert.ok(html.includes('article.dataset.bindingStatus="verified"'));
});

test('inline JavaScript blocks in Mia chat page parse successfully', () => {
  const scripts = [...html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)];
  assert.ok(scripts.length > 0, 'expected inline JavaScript blocks');
  for (const [index, match] of scripts.entries()) {
    assert.doesNotThrow(() => new vm.Script(match[1], { filename: 'mia-chat-inline-' + index + '.js' }));
  }
});
