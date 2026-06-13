import { getSql, isDatabaseUnavailable } from './lib/db.mjs';
import { corsResponse, errorResponse, jsonResponse, readJson } from './lib/http.mjs';
import { requireAuthUser } from './lib/auth.mjs';

export const config = { path: '/api/features' };

// Coin-holder gate: minimum token balance to submit a suggestion (server-enforced
// in a future step when Solana RPC is wired; for now the client enforces it).
const MIN_COIN_BALANCE = 100;

const SEED_SUGGESTIONS = [
  { title: 'NPC companions', description: 'Add AI-driven NPCs that wander your world and interact with players — merchants, wanderers, quest-givers.', wallet: 'admin', coin_balance: 100, vote_weight: 0, status: 'open' },
  { title: 'Weather system', description: 'Dynamic weather — rain, fog, storms, and sunshine — that affects crop growth and atmosphere.', wallet: 'admin', coin_balance: 100, vote_weight: 0, status: 'open' },
  { title: 'World portals', description: 'Place a portal in your world that links to another player\'s world. Teleport between tinyverses seamlessly.', wallet: 'admin', coin_balance: 100, vote_weight: 0, status: 'open' },
  { title: 'Custom biomes', description: 'Choose from desert, tundra, jungle, or ocean biomes as the base environment for your world.', wallet: 'admin', coin_balance: 100, vote_weight: 0, status: 'open' },
  { title: 'Player housing', description: 'Let visiting players claim a small plot inside a world and build a personal dwelling.', wallet: 'admin', coin_balance: 100, vote_weight: 0, status: 'open' },
];

async function seedSuggestions(sql) {
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM feature_suggestions`;
  if (Number(n) > 0) return;
  for (const s of SEED_SUGGESTIONS) {
    await sql`
      INSERT INTO feature_suggestions (title, description, wallet, coin_balance, vote_weight, status)
      VALUES (${s.title}, ${s.description}, ${s.wallet}, ${s.coin_balance}, ${s.vote_weight}, ${s.status})
      ON CONFLICT DO NOTHING
    `;
  }
}

async function ensureTables(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS feature_suggestions (
      id            SERIAL PRIMARY KEY,
      title         TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      wallet        TEXT NOT NULL,
      coin_balance  BIGINT NOT NULL DEFAULT 0,
      vote_weight   BIGINT NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','planned','done','rejected')),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS feature_votes (
      id            SERIAL PRIMARY KEY,
      suggestion_id INT  NOT NULL REFERENCES feature_suggestions(id) ON DELETE CASCADE,
      wallet        TEXT NOT NULL,
      coin_balance  BIGINT NOT NULL DEFAULT 0,
      vote          SMALLINT NOT NULL DEFAULT 1 CHECK (vote IN (1,-1)),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (suggestion_id, wallet)
    )
  `;
}

function suggestionDto(row) {
  return {
    id:           row.id,
    title:        row.title,
    description:  row.description,
    wallet:       row.wallet,
    vote_weight:  Number(row.vote_weight) || 0,
    status:       row.status,
    created_at:   row.created_at,
  };
}

function envValue(name) {
  try {
    if (globalThis.Netlify && Netlify.env && typeof Netlify.env.get === 'function') {
      const value = Netlify.env.get(name);
      if (value) return value;
    }
  } catch (_) {}
  return process.env[name] || '';
}

function isAdmin(request) {
  const secret = envValue('TINYWORLD_ADMIN_SECRET');
  if (!secret) return false;
  return (request.headers.get('x-admin-secret') || '') === secret;
}

export default async function featuresFunction(request) {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return corsResponse(origin);

  // ---- GET — public list ----
  if (request.method === 'GET') {
    try {
      const sql = getSql();
      await ensureTables(sql);
      await seedSuggestions(sql);
      const url = new URL(request.url);
      const status = url.searchParams.get('status') || 'open';
      const rows = await sql`
        SELECT * FROM feature_suggestions
        WHERE ${status === 'all' ? sql`TRUE` : sql`status = ${status}`}
        ORDER BY vote_weight DESC, created_at DESC
        LIMIT 200
      `;
      return jsonResponse({ suggestions: rows.map(suggestionDto), admin: isAdmin(request) }, origin);
    } catch (err) {
      if (isDatabaseUnavailable(err)) return jsonResponse({ suggestions: [], source: 'unavailable' }, origin);
      console.error('[features] GET error:', err);
      return errorResponse('Database error', 500, origin);
    }
  }

  // ---- POST — submit a suggestion (requires wallet auth or admin) ----
  if (request.method === 'POST') {
    const isAdminReq = isAdmin(request);
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'suggest';

    const body = await readJson(request);
    const rawWallet = String(body && body.wallet || '').trim();
    const wallet = rawWallet || (isAdminReq ? 'admin' : '');
    if (!wallet) return errorResponse('wallet is required', 400, origin);

    const coinBalance = isAdminReq
      ? MIN_COIN_BALANCE
      : Math.max(0, Math.round(Number(body && body.coinBalance) || 0));

    if (action === 'vote') {
      const suggestionId = Number(body && body.suggestionId);
      const vote = Number(body && body.vote) === -1 ? -1 : 1;
      if (!suggestionId) return errorResponse('suggestionId is required', 400, origin);
      if (!isAdminReq && coinBalance < MIN_COIN_BALANCE) return errorResponse('Insufficient coin balance to vote', 403, origin);
      try {
        const sql = getSql();
        await ensureTables(sql);
        await sql`
          INSERT INTO feature_votes (suggestion_id, wallet, coin_balance, vote)
          VALUES (${suggestionId}, ${wallet}, ${coinBalance}, ${vote})
          ON CONFLICT (suggestion_id, wallet) DO UPDATE
            SET vote = ${vote}, coin_balance = ${coinBalance}, created_at = NOW()
        `;
        // Recompute vote_weight as sum of coin_balance * vote.
        await sql`
          UPDATE feature_suggestions
          SET vote_weight = (
            SELECT COALESCE(SUM(coin_balance * vote), 0)
            FROM feature_votes
            WHERE suggestion_id = ${suggestionId}
          ), updated_at = NOW()
          WHERE id = ${suggestionId}
        `;
        const rows = await sql`SELECT * FROM feature_suggestions WHERE id = ${suggestionId}`;
        return jsonResponse({ suggestion: rows.length ? suggestionDto(rows[0]) : null }, origin);
      } catch (err) {
        console.error('[features] vote error:', err);
        return errorResponse('Database error', 500, origin);
      }
    }

    // suggest
    const title = String(body && body.title || '').slice(0, 200).trim();
    const description = String(body && body.description || '').slice(0, 1000).trim();
    if (!title) return errorResponse('title is required', 400, origin);
    if (!isAdminReq && coinBalance < MIN_COIN_BALANCE) return errorResponse('You must hold at least ' + MIN_COIN_BALANCE + ' coins to suggest features', 403, origin);
    try {
      const sql = getSql();
      await ensureTables(sql);
      const rows = await sql`
        INSERT INTO feature_suggestions (title, description, wallet, coin_balance, vote_weight)
        VALUES (${title}, ${description}, ${wallet}, ${coinBalance}, ${coinBalance})
        RETURNING *
      `;
      return jsonResponse({ suggestion: suggestionDto(rows[0]) }, origin, 201);
    } catch (err) {
      console.error('[features] suggest error:', err);
      return errorResponse('Database error', 500, origin);
    }
  }

  // ---- PATCH — admin status update ----
  if (request.method === 'PATCH') {
    if (!isAdmin(request)) return errorResponse('Forbidden', 403, origin);
    const url = new URL(request.url);
    const id = Number(url.searchParams.get('id'));
    if (!id) return errorResponse('id is required', 400, origin);
    const body = await readJson(request);
    const status = ['open','planned','done','rejected'].includes(body && body.status) ? body.status : null;
    if (!status) return errorResponse('valid status is required', 400, origin);
    try {
      const sql = getSql();
      const rows = await sql`
        UPDATE feature_suggestions SET status = ${status}, updated_at = NOW()
        WHERE id = ${id} RETURNING *
      `;
      if (!rows.length) return errorResponse('Not found', 404, origin);
      return jsonResponse({ suggestion: suggestionDto(rows[0]) }, origin);
    } catch (err) {
      console.error('[features] PATCH error:', err);
      return errorResponse('Database error', 500, origin);
    }
  }

  return errorResponse('Method not allowed', 405, origin);
}
