import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const mockGenerator = {
  generate() {
    return { gridSize: 8, cells: [] };
  },
  profile() {
    return {
      name: 'Test Isle',
      archetype: 'Pastoral',
      archetypeKey: 'pastoral',
      bestUse: 'Explore',
      traits: ['calm'],
      topStats: [{ label: 'Charm', value: 6 }],
      economy: { rarity: 'Common', potential: 2 },
    };
  },
};

function loadCollectibles(storage, extras) {
  const store = new Map(Object.entries(storage || {}));
  const localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
  };
  const context = {
    window: Object.assign({ TinyWorldIslandGenerator: mockGenerator }, extras || {}),
    localStorage,
    console,
  };
  context.window.window = context.window;
  const src = readFileSync(new URL('../scripts/tinyverse-collectibles.js', import.meta.url), 'utf8');
  vm.runInNewContext(src, context, { filename: 'tinyverse-collectibles.js' });
  return context.window.TinyverseCollectibles;
}

test('rollPack returns exactly one island card', () => {
  const TC = loadCollectibles({});
  const rolled = TC.rollPack('pack-test-seed');
  assert.equal(rolled.cards.length, 1);
  assert.equal(rolled.cards[0].kind, 'island');
  assert.equal(rolled.packLabel, '1 Island');
});

test('openPack enforces three free opens per user email', () => {
  const TC = loadCollectibles({});
  TC.setFreePackUser('player@example.com');
  assert.equal(TC.getFreePacksRemaining(), 3);
  assert.ok(TC.openPack({ id: 'island-pack', name: 'Island Pack' }));
  assert.ok(TC.openPack({ id: 'island-pack', name: 'Island Pack' }));
  assert.ok(TC.openPack({ id: 'island-pack', name: 'Island Pack' }));
  assert.equal(TC.getFreePacksRemaining(), 0);
  assert.equal(TC.openPack({ id: 'island-pack', name: 'Island Pack' }), null);
});

test('free pack counter is scoped per email', () => {
  const TC = loadCollectibles({});
  TC.setFreePackUser('alice@example.com');
  assert.ok(TC.openPack());
  assert.equal(TC.getFreePacksRemaining(), 2);
  TC.setFreePackUser('bob@example.com');
  assert.equal(TC.getFreePacksRemaining(), 3);
});