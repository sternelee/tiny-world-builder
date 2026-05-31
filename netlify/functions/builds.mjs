import { requireAuthUser } from './lib/auth.mjs';
import { getSql } from './lib/db.mjs';
import { corsResponse, errorResponse, jsonResponse, readJson, sameOriginWriteGuard } from './lib/http.mjs';
import { ensureProfile } from './lib/profiles.mjs';

export const config = { path: '/api/builds' };

function buildDto(row, includeData = false) {
  const out = {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeData) out.data = row.data;
  return out;
}

function buildIdFromRequest(request) {
  const id = new URL(request.url).searchParams.get('id');
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function validateBuildPayload(body) {
  const name = String((body && body.name) || '').trim().slice(0, 120) || 'Untitled world';
  const data = body && body.data;
  if (!data || typeof data !== 'object' || !Array.isArray(data.cells)) {
    return { error: 'World JSON must include a cells array' };
  }
  if (JSON.stringify(data).length > 2_000_000) {
    return { error: 'World JSON is too large' };
  }
  return { name, data };
}

export default async function buildsFunction(request) {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return corsResponse(origin);

  const auth = await requireAuthUser(request, origin);
  if (auth.response) return auth.response;

  try {
    const sql = getSql();
    const profile = await ensureProfile(auth.user);
    const buildId = buildIdFromRequest(request);

    if (request.method === 'GET') {
      if (buildId) {
        const rows = await sql`
          SELECT id, profile_id, name, data, created_at, updated_at
          FROM builds
          WHERE id = ${buildId} AND profile_id = ${profile.id}
          LIMIT 1
        `;
        if (!rows.length) return errorResponse('Build not found', 404, origin);
        return jsonResponse(buildDto(rows[0], true), origin);
      }
      const rows = await sql`
        SELECT id, profile_id, name, created_at, updated_at
        FROM builds
        WHERE profile_id = ${profile.id}
        ORDER BY updated_at DESC
        LIMIT 100
      `;
      return jsonResponse(rows.map(row => buildDto(row)), origin);
    }

    if (request.method === 'POST') {
      if (!sameOriginWriteGuard(request)) return errorResponse('Forbidden', 403, origin);
      const body = await readJson(request);
      const input = validateBuildPayload(body);
      if (input.error) return errorResponse(input.error, 400, origin);
      const rows = await sql`
        INSERT INTO builds (profile_id, name, data)
        VALUES (${profile.id}, ${input.name}, ${sql.json(input.data)})
        RETURNING id, profile_id, name, data, created_at, updated_at
      `;
      return jsonResponse(buildDto(rows[0], true), origin, 201);
    }

    if (request.method === 'PUT') {
      if (!sameOriginWriteGuard(request)) return errorResponse('Forbidden', 403, origin);
      if (!buildId) return errorResponse('Missing build id', 400, origin);
      const body = await readJson(request);
      const input = validateBuildPayload(body);
      if (input.error) return errorResponse(input.error, 400, origin);
      const rows = await sql`
        UPDATE builds
        SET name = ${input.name},
            data = ${sql.json(input.data)},
            updated_at = NOW()
        WHERE id = ${buildId} AND profile_id = ${profile.id}
        RETURNING id, profile_id, name, data, created_at, updated_at
      `;
      if (!rows.length) return errorResponse('Build not found', 404, origin);
      return jsonResponse(buildDto(rows[0], true), origin);
    }

    if (request.method === 'DELETE') {
      if (!sameOriginWriteGuard(request)) return errorResponse('Forbidden', 403, origin);
      if (!buildId) return errorResponse('Missing build id', 400, origin);
      const rows = await sql`
        DELETE FROM builds
        WHERE id = ${buildId} AND profile_id = ${profile.id}
        RETURNING id
      `;
      if (!rows.length) return errorResponse('Build not found', 404, origin);
      return jsonResponse({ ok: true }, origin);
    }

    return errorResponse('Method not allowed', 405, origin);
  } catch (err) {
    console.error('[builds]', err);
    return errorResponse('Build request failed', 500, origin);
  }
}
