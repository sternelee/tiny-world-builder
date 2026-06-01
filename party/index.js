// @ts-check
/// <reference types="partykit/server" />

const MESSAGE_LIMIT = 48 * 1024;
const PRESENCE_KEYS = new Set(['id', 'name', 'color', 'cursor', 'selection', 'tool', 'ts']);
const OP_KEYS = new Set(['id', 'kind', 'x', 'z', 'cell', 'ts']);

// Generous finite ghost-board bound. The world.schema.json $defs/coord caps
// home/import cells at +/-1024, but sparse user-edited ghost-board cells and
// island-derived world coords (boardX * GRID + local) can legitimately reach
// further, so we do NOT clamp to the home grid. This cap only rejects clearly
// crafted coordinates (e.g. 9999999) that would grow world[x][z] without bound.
const MAX_CELL_COORD = 100000;

// Schema enums mirrored from world.schema.json $defs/terrain (line 89) and
// $defs/kind (line 94). The server cannot import the client schema, so these
// are hardcoded; keep them in sync if the schema changes.
const TERRAIN_ENUM = new Set(['grass', 'path', 'dirt', 'water', 'stone', 'lava', 'sand', 'snow']);
const KIND_ENUM = new Set([
  'house', 'tree', 'fence', 'rock', 'bridge', 'crop', 'corn', 'wheat', 'pumpkin',
  'carrot', 'sunflower', 'tuft', 'flower', 'bush', 'cow', 'sheep', 'lamp-post',
  'spotlight', 'voxel-build', 'model-stamp',
]);

// Mirror of MAX_FLOORS = 8 from engine/world/10-world-data.js:246 (the server
// cannot import it). Both floors and terrainFloors are capped at 8 in the
// schema (cellObject), so clamp both to block a 1e7-floor skyscraper DoS.
const MAX_FLOORS = 8;

// Explicit allowlist of cell fields the renderer actually consumes, taken from
// the live cell shape written in engine/world/29-persistence-api.js:388-402.
// Anything outside this set (including attacker-supplied flags like userEdited)
// is dropped. Custom objects ride in via kind:'voxel-build' + appearance, not
// raw customParts, so they replicate without being listed here.
const CELL_FIELDS = new Set([
  'terrain', 'kind', 'floors', 'terrainFloors', 'buildingType', 'fenceSide',
  'extras', 'rotationY', 'offsetX', 'offsetY', 'offsetZ', 'appearance', 'waterFlow',
]);

function clampFloors(value) {
  const n = Math.round(cleanNumber(value, 1));
  if (n < 1) return 1;
  if (n > MAX_FLOORS) return MAX_FLOORS;
  return n;
}

// Per-connection token buckets. Presence is throttled tighter (client maxes
// ~11/sec); cell.set is generous so a fast drag-paint burst is never dropped.
// refill = sustained tokens per second; burst = bucket capacity.
const RATE_LIMITS = {
  presence: { refill: 25, burst: 40 },
  'cell.set': { refill: 40, burst: 80 },
};

function takeToken(buckets, type, now) {
  const cfg = RATE_LIMITS[type];
  if (!cfg) return true;
  let bucket = buckets.get(type);
  if (!bucket) {
    bucket = { tokens: cfg.burst, last: now };
    buckets.set(type, bucket);
  }
  const elapsed = Math.max(0, now - bucket.last) / 1000;
  bucket.tokens = Math.min(cfg.burst, bucket.tokens + elapsed * cfg.refill);
  bucket.last = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

function safeJson(message) {
  if (typeof message !== 'string' || message.length > MESSAGE_LIMIT) return null;
  try {
    return JSON.parse(message);
  } catch (_) {
    return null;
  }
}

function cleanText(value, limit) {
  return String(value || '').trim().slice(0, limit);
}

function cleanNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanCursor(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    x: cleanNumber(value.x),
    z: cleanNumber(value.z),
    y: cleanNumber(value.y),
  };
}

function cleanSelection(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 64).map(cell => {
    if (!cell || typeof cell !== 'object') return null;
    return {
      x: Math.round(cleanNumber(cell.x)),
      z: Math.round(cleanNumber(cell.z)),
    };
  }).filter(Boolean);
}

function cleanPresence(input, fallbackId) {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  for (const key of PRESENCE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key];
  }
  out.id = cleanText(out.id || fallbackId, 64) || fallbackId;
  out.name = cleanText(out.name || 'Builder', 48) || 'Builder';
  out.color = /^#[0-9a-f]{6}$/i.test(String(out.color || '')) ? String(out.color) : '#3c82f7';
  out.cursor = cleanCursor(out.cursor);
  out.selection = cleanSelection(out.selection);
  out.tool = cleanText(out.tool, 48);
  out.ts = Date.now();
  return out;
}

function cleanCell(cell) {
  if (!cell || typeof cell !== 'object') return null;
  const out = {};
  // Copy only allowlisted fields, then deep-clone the survivors so we never
  // forward attacker-controlled prototype/extra keys downstream.
  for (const key of CELL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(cell, key)) out[key] = cell[key];
  }
  let copy;
  try {
    copy = JSON.parse(JSON.stringify(out));
  } catch (_) {
    return null;
  }
  // Normalize terrain/kind against the schema enums; clamp the stack counts.
  copy.terrain = TERRAIN_ENUM.has(copy.terrain) ? copy.terrain : 'grass';
  if (copy.kind != null && !KIND_ENUM.has(copy.kind)) copy.kind = null;
  if (copy.floors != null) copy.floors = clampFloors(copy.floors);
  if (copy.terrainFloors != null) copy.terrainFloors = clampFloors(copy.terrainFloors);
  if (!Array.isArray(copy.extras)) copy.extras = [];
  return copy;
}

function cleanCellSet(input) {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  for (const key of OP_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key];
  }
  out.id = cleanText(out.id, 96) || String(Date.now());
  out.kind = 'cell.set';
  out.x = Math.round(cleanNumber(out.x));
  out.z = Math.round(cleanNumber(out.z));
  // Range-check coordinates so a crafted op (e.g. x/z = 9999999) cannot grow
  // every peer's world[x][z] without bound. Reject (drop) rather than clamp:
  // clamping to the home grid would break legitimate sparse ghost-board cells.
  if (!Number.isFinite(out.x) || !Number.isFinite(out.z)) return null;
  if (Math.abs(out.x) > MAX_CELL_COORD || Math.abs(out.z) > MAX_CELL_COORD) return null;
  out.cell = cleanCell(out.cell);
  out.ts = Date.now();
  if (!out.cell) return null;
  return out;
}

// Valid lobby/admit roles. 'host' is assigned by promotion only, never by the
// wire `role` field on admit/setRole (a host cannot mint another host).
const ASSIGNABLE_ROLES = new Set(['viewer', 'player', 'editor']);

function cleanRole(value) {
  return ASSIGNABLE_ROLES.has(value) ? value : 'viewer';
}

// Editor scope bounds. Returns null when not a usable rectangle (so an editor
// granted no/invalid bounds is treated as having no scope -> all edits drop).
function cleanIsland(value) {
  if (!value || typeof value !== 'object') return null;
  const minX = Math.round(cleanNumber(value.minX, NaN));
  const maxX = Math.round(cleanNumber(value.maxX, NaN));
  const minZ = Math.round(cleanNumber(value.minZ, NaN));
  const maxZ = Math.round(cleanNumber(value.maxZ, NaN));
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null;
  if (maxX < minX || maxZ < minZ) return null;
  return { minX, maxX, minZ, maxZ };
}

function inIsland(island, x, z) {
  if (!island) return false;
  return x >= island.minX && x <= island.maxX && z >= island.minZ && z <= island.maxZ;
}

export default class TinyWorldParty {
  constructor(room) {
    this.room = room;
    this.presence = new Map();
    // sender.id -> Map(type -> token bucket). Per-connection rate limit state.
    this.rateLimits = new Map();
    // The first connection becomes host. Only host messages (admit/decline/
    // kick/setRole) are honored.
    this.hostId = null;
    // id -> { role, island }. Admitted participants (presence + edits flow).
    this.admitted = new Map();
    // id -> { id, name, presence }. Pending lobby members awaiting admit.
    this.lobby = new Map();
    // id -> { role, island }. Remembered seats so a WS reconnect (stable _pk
    // conn id) re-admits a returning member instead of re-lobbying them.
    // Cleared on kick/decline; kept across a normal disconnect.
    this.seats = new Map();
  }

  sendTo(id, obj) {
    const c = this.room.getConnection(id);
    if (c) c.send(JSON.stringify(obj));
  }

  // Broadcast only to admitted participants (incl. host). Lobby/un-admitted
  // connections must never receive world or presence data until admitted.
  broadcastToAdmitted(obj, exceptId) {
    const msg = JSON.stringify(obj);
    for (const id of this.admitted.keys()) {
      if (id === exceptId) continue;
      const c = this.room.getConnection(id);
      if (c) c.send(msg);
    }
  }

  pendingList() {
    return Array.from(this.lobby.values()).map(e => ({ id: e.id, name: e.name }));
  }

  onConnect(conn) {
    if (!this.hostId) {
      // First in the room is host: full rights, no lobby gate.
      this.hostId = conn.id;
      this.admitted.set(conn.id, { role: 'host', island: null });
      conn.send(JSON.stringify({
        type: 'welcome',
        room: this.room.id,
        id: conn.id,
        role: 'host',
        admitted: true,
        peers: Array.from(this.presence.values()),
      }));
      return;
    }
    // Returning admitted member: a WS reconnect reuses the same _pk conn id, so
    // re-admit from the remembered seat instead of bouncing them to the lobby.
    const seat = this.seats.get(conn.id);
    if (seat) {
      this.admitted.set(conn.id, { role: seat.role, island: seat.island });
      conn.send(JSON.stringify({
        type: 'welcome',
        room: this.room.id,
        id: conn.id,
        role: seat.role,
        admitted: true,
        peers: Array.from(this.presence.values()),
      }));
      return;
    }
    // Everyone after the host starts in the lobby, un-admitted, no peers yet.
    this.lobby.set(conn.id, { id: conn.id, name: '', presence: null });
    conn.send(JSON.stringify({
      type: 'welcome',
      room: this.room.id,
      id: conn.id,
      role: 'viewer',
      admitted: false,
      peers: [],
    }));
  }

  onMessage(message, sender) {
    const data = safeJson(message);
    if (!data || typeof data.type !== 'string') return;

    // Per-connection rate limit, separate buckets per message type. A hostile
    // client opening a raw socket ignores the client-side throttle, so drop
    // (return, no broadcast) once a connection exceeds its sustained rate. Host
    // moderation types (admit/decline/kick/setRole) are unbucketed (unknown to
    // RATE_LIMITS, so takeToken passes) — host-only and low volume.
    let buckets = this.rateLimits.get(sender.id);
    if (!buckets) {
      buckets = new Map();
      this.rateLimits.set(sender.id, buckets);
    }
    if (!takeToken(buckets, data.type, Date.now())) return;

    if (data.type === 'presence') {
      const presence = cleanPresence(data.presence, sender.id);
      if (!presence) return;
      presence.id = sender.id;
      if (this.admitted.has(sender.id)) {
        // Admitted: store and re-broadcast presence to the room as before.
        this.presence.set(sender.id, presence);
        this.broadcastToAdmitted({ type: 'presence', presence }, sender.id);
        return;
      }
      // Lobby client: never re-broadcast. Just learn their name so the host can
      // label the admit panel; notify the host only when the name first appears
      // or changes (avoids re-toasting on the ~2.5s presence heartbeat).
      const entry = this.lobby.get(sender.id);
      if (!entry) return;
      const prevName = entry.name;
      entry.presence = presence;
      entry.name = presence.name || '';
      if (this.hostId && entry.name && entry.name !== prevName) {
        this.sendTo(this.hostId, { type: 'lobby.join', id: entry.id, name: entry.name });
      }
      return;
    }

    if (data.type === 'cell.set') {
      const op = cleanCellSet(data.op);
      if (!op) return;
      // GATING: edits flow only from the host or an admitted editor. Viewers,
      // players, and lobby clients are dropped. Never trust the client to stay
      // in scope: an editor's op is bounds-checked against its granted island.
      if (sender.id === this.hostId) {
        // host: unrestricted.
      } else {
        const seat = this.admitted.get(sender.id);
        if (!seat || seat.role !== 'editor') return;
        if (!inIsland(seat.island, op.x, op.z)) return;
      }
      op.userId = sender.id;
      this.broadcastToAdmitted({ type: 'cell.set', op }, sender.id);
      return;
    }

    // ---- Host-only moderation. Honored only from the current host. ----
    if (data.type === 'admit') {
      if (sender.id !== this.hostId) return;
      const id = cleanText(data.id, 96);
      const entry = this.lobby.get(id);
      if (!entry) return;
      const role = cleanRole(data.role);
      const island = role === 'editor' ? cleanIsland(data.island) : null;
      this.lobby.delete(id);
      this.admitted.set(id, { role, island });
      this.seats.set(id, { role, island });
      if (this.hostId) this.sendTo(this.hostId, { type: 'lobby.leave', id });
      this.sendTo(id, {
        type: 'admitted',
        role,
        island,
        peers: Array.from(this.presence.values()),
      });
      return;
    }

    if (data.type === 'decline') {
      if (sender.id !== this.hostId) return;
      const id = cleanText(data.id, 96);
      if (!this.lobby.has(id)) return;
      this.lobby.delete(id);
      if (this.hostId) this.sendTo(this.hostId, { type: 'lobby.leave', id });
      this.sendTo(id, { type: 'declined' });
      const c = this.room.getConnection(id);
      if (c) c.close();
      return;
    }

    if (data.type === 'kick') {
      if (sender.id !== this.hostId) return;
      const id = cleanText(data.id, 96);
      if (id === this.hostId || !this.admitted.has(id)) return;
      this.admitted.delete(id);
      this.presence.delete(id);
      this.seats.delete(id);
      this.sendTo(id, { type: 'kicked' });
      const c = this.room.getConnection(id);
      if (c) c.close();
      // The kicked peer's presence vanishes; tell everyone else to drop them.
      this.broadcastToAdmitted({ type: 'leave', id }, id);
      return;
    }

    if (data.type === 'setRole') {
      if (sender.id !== this.hostId) return;
      const id = cleanText(data.id, 96);
      if (id === this.hostId) return;
      const seat = this.admitted.get(id);
      if (!seat) return;
      const role = cleanRole(data.role);
      const island = role === 'editor' ? cleanIsland(data.island) : null;
      seat.role = role;
      seat.island = island;
      this.seats.set(id, { role, island });
      this.sendTo(id, { type: 'role', role, island, admitted: true });
      return;
    }
  }

  onClose(conn) {
    const wasLobby = this.lobby.has(conn.id);
    const wasHost = conn.id === this.hostId;
    this.presence.delete(conn.id);
    this.rateLimits.delete(conn.id);
    this.admitted.delete(conn.id);
    this.lobby.delete(conn.id);
    // Only an admitted peer's departure is meaningful to other participants;
    // a lobby member was never visible to them.
    if (!wasLobby) this.broadcastToAdmitted({ type: 'leave', id: conn.id }, conn.id);
    // A pending lobby member leaving removes a row from the host's admit panel.
    if (wasLobby && this.hostId) this.sendTo(this.hostId, { type: 'lobby.leave', id: conn.id });

    if (wasHost) {
      this.hostId = null;
      // Prefer the oldest still-admitted connection (Map insertion order = age).
      let next = null;
      for (const id of this.admitted.keys()) { next = id; break; }
      if (next) {
        const seat = this.admitted.get(next);
        seat.role = 'host';
        seat.island = null;
        this.hostId = next;
        this.sendTo(next, { type: 'role', role: 'host', island: null, admitted: true, pending: this.pendingList() });
        this.sendTo(next, { type: 'lobby.list', pending: this.pendingList() });
        return;
      }
      // No admitted peers left: auto-promote + admit the oldest lobby member.
      let oldest = null;
      for (const id of this.lobby.keys()) { oldest = id; break; }
      if (oldest) {
        this.lobby.delete(oldest);
        this.admitted.set(oldest, { role: 'host', island: null });
        this.hostId = oldest;
        this.sendTo(oldest, { type: 'role', role: 'host', island: null, admitted: true, pending: this.pendingList() });
        this.sendTo(oldest, { type: 'lobby.list', pending: this.pendingList() });
      }
    }
  }

  onError(conn) {
    this.onClose(conn);
  }
}
