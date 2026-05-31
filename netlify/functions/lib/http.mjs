export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Vary': 'Origin',
  };
}

export function corsResponse(origin) {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export function jsonResponse(body, origin, status = 200, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: Object.assign(corsHeaders(origin), extraHeaders),
  });
}

export function errorResponse(message, status, origin) {
  return jsonResponse({ error: message }, origin, status);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch (_) {
    return null;
  }
}

export function sameOriginWriteGuard(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}
