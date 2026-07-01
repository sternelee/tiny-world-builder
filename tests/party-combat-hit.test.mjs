// Unit tests for the PartyKit combat.hit relay (party/index.js) — world-room path.
// The flight-combat client (41-flight-combat.js) sends { type:'combat.hit', to, damage,
// source } through the world-room WS path when a plane gun/missile lands a hit. The
// handler MUST live in onWorldMessage (not only onMessage), because world rooms
// early-return to onWorldMessage before the onMessage combat.hit branch can fire —
// the same dead-relay trap that previously hit the plane 'entity' broadcast (see
// party-flight-entity.test.mjs).
// Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import TinyWorldParty from '../party/index.js';

function makeRoom() {
  const conns = new Map();
  return {
    id: 'world-meadow',
    conns,
    getConnection: (id) => conns.get(id) || null,
    broadcast: () => {},
    addConn(id) {
      const c = { id, received: [], closed: false,
        send(raw) { c.received.push(JSON.parse(raw)); }, close() { c.closed = true; } };
      conns.set(id, c); return c;
    },
  };
}

function worldSetup() {
  const room = makeRoom();
  const party = new TinyWorldParty(room);
  party.setWorldStateFromData(
    { v: 4, gridSize: 8, cells: [{ x: 5, z: 5, terrain: 'stone' }] },
    { id: 42, taxPercent: 10, ownerProfileId: 99 },
  );
  // onConnect auto-admits as observer in a world room
  const connect = (id) => { const c = room.addConn(id); party.onConnect(c); return c; };
  return { room, party, connect };
}

test('combat.hit routes to only the targeted peer via world path, stamped from sender', () => {
  const { party, connect } = worldSetup();
  const a = connect('a');
  const b = connect('b');
  const c = connect('c');
  a.received.length = 0; b.received.length = 0; c.received.length = 0;

  party.onWorldMessage({
    type: 'combat.hit', to: 'b', damage: 8, source: 'gun',
    by: 'spoofed', // client-supplied — must be replaced with sender.id
  }, a);

  const msgB = b.received.find(m => m.type === 'combat.hit');
  assert.ok(msgB, 'targeted peer b receives the hit');
  assert.equal(msgB.by, 'a', 'by is stamped from sender.id, not the client-supplied value');
  assert.equal(msgB.to, 'b');
  assert.equal(msgB.damage, 8);
  assert.equal(msgB.source, 'gun');

  // Not broadcast: neither the sender nor an uninvolved third peer gets it.
  assert.equal(a.received.find(m => m.type === 'combat.hit'), undefined, 'sender does not receive its own hit report');
  assert.equal(c.received.find(m => m.type === 'combat.hit'), undefined, 'uninvolved peer does not receive the hit');
});

test('combat.hit damage is clamped to a sane non-negative range', () => {
  const { party, connect } = worldSetup();
  const a = connect('a');
  const b = connect('b');
  b.received.length = 0;

  party.onWorldMessage({ type: 'combat.hit', to: 'b', damage: -50, source: 'gun' }, a);
  party.onWorldMessage({ type: 'combat.hit', to: 'b', damage: 999999, source: 'missile' }, a);

  const hits = b.received.filter(m => m.type === 'combat.hit');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].damage, 0, 'negative damage clamps to 0');
  assert.equal(hits[1].damage, 10000, 'damage is capped');
});

test('combat.hit to a non-admitted target is dropped', () => {
  const { party, connect } = worldSetup();
  const a = connect('a');
  const b = connect('b');
  b.received.length = 0;

  party.onWorldMessage({ type: 'combat.hit', to: 'ghost-peer', damage: 8, source: 'gun' }, a);

  assert.equal(b.received.length, 0, 'an unrelated admitted peer receives nothing for a bogus target');
});

test('non-admitted sender combat.hit is ignored', () => {
  const { party, connect } = worldSetup();
  const b = connect('b');
  b.received.length = 0;

  const fakeSender = { id: 'never-connected', received: [], send(raw) { this.received.push(JSON.parse(raw)); } };
  party.onWorldMessage({ type: 'combat.hit', to: 'b', damage: 8, source: 'gun' }, fakeSender);

  assert.equal(b.received.find(m => m.type === 'combat.hit'), undefined, 'non-admitted sender produces no relay');
});

// Drives the FULL onMessage entry (not onWorldMessage directly) to lock in that a world
// room actually reaches this handler through the real entry point, the same regression
// shape as the 'entity' relay fix.
test('combat.hit sent through onMessage routes into the world relay (regression: handler must be reachable)', () => {
  const { party, connect } = worldSetup();
  const a = connect('a');
  const b = connect('b');
  a.received.length = 0; b.received.length = 0;

  party.onMessage(JSON.stringify({ type: 'combat.hit', to: 'b', damage: 8, source: 'gun' }), a);

  const msgB = b.received.find(m => m.type === 'combat.hit');
  assert.ok(msgB, 'onMessage routes the world-room combat.hit into onWorldMessage and relays it');
  assert.equal(msgB.by, 'a', 'still server-stamped through the full path');
  assert.equal(msgB.damage, 8);
});
