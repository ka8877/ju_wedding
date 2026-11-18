import { publicSupabaseConfig } from '../../src/lib/public-config';
import type { VenueSearchResult } from '../../src/lib/venue-search';

interface SearchBindings {
  NAVER_SEARCH_CLIENT_ID?: string;
  NAVER_SEARCH_CLIENT_SECRET?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

interface NaverPlace {
  title?: string;
  roadAddress?: string;
  address?: string;
  mapx?: string;
  mapy?: string;
}

const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', '#39': "'" };

function placeFromResult(item: NaverPlace): VenueSearchResult | null {
  const name = item.title?.replace(/<\/?b>/gi, '').replace(/&(amp|quot|apos|lt|gt|nbsp|#39);/g, (_, key: string) => entities[key]).trim().slice(0, 100);
  const address = (item.roadAddress?.trim() || item.address?.trim())?.slice(0, 300);
  if (!name || !address) return null;

  const x = item.mapx?.trim() ? Number(item.mapx) : NaN;
  const y = item.mapy?.trim() ? Number(item.mapy) : NaN;
  // Naver may represent WGS84 coordinates as degrees multiplied by 10^7.
  const scale = Math.abs(x) > 180 || Math.abs(y) > 90 ? 10_000_000 : 1;
  const lat = y / scale;
  const lng = x / scale;
  const validCoordinates = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);
  return { name, address, lat: validCoordinates ? lat : null, lng: validCoordinates ? lng : null };
}

function json(status: number, body: object) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function onRequest({ request, env }: { request: Request; env: SearchBindings }): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  const authorization = request.headers.get('Authorization');
  if (!authorization || !/^Bearer [\w.-]+$/i.test(authorization)) return json(401, { error: 'login_required' });

  const body: { query?: unknown } | null = await request.json().catch(() => null);
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  if (!query || query.length > 150) return json(400, { error: 'invalid_query' });

  try {
    const projectUrl = env.VITE_SUPABASE_URL?.trim() || publicSupabaseConfig.url;
    const projectKey = env.VITE_SUPABASE_ANON_KEY?.trim() || publicSupabaseConfig.key;
    const admin = await fetch(new URL('/rest/v1/rpc/is_wedding_admin', projectUrl), {
      method: 'POST', headers: { Authorization: authorization, apikey: projectKey, 'Content-Type': 'application/json' },
      body: '{}', redirect: 'error', signal: AbortSignal.timeout(5_000),
    });
    if (admin.status === 401) return json(401, { error: 'login_required' });
    if (admin.status === 403) return json(403, { error: 'admin_required' });
    if (!admin.ok) return json(502, { error: 'admin_check_failed' });
    if (await admin.json() !== true) return json(403, { error: 'admin_required' });

    const clientId = env.NAVER_SEARCH_CLIENT_ID?.trim();
    const clientSecret = env.NAVER_SEARCH_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return json(503, { error: 'naver_unconfigured' });

    const naverUrl = new URL('https://naverapihub.apigw.ntruss.com/search/v1/local');
    naverUrl.search = new URLSearchParams({ query, display: '5', sort: 'random', format: 'json' }).toString();
    const response = await fetch(naverUrl, {
      headers: { 'X-NCP-APIGW-API-KEY-ID': clientId, 'X-NCP-APIGW-API-KEY': clientSecret },
      redirect: 'error', signal: AbortSignal.timeout(7_000),
    });
    if (response.status === 429) return json(429, { error: 'naver_limit' });
    if (response.status === 401 || response.status === 403) return json(503, { error: 'naver_unconfigured' });
    if (!response.ok) return json(502, { error: 'naver_unavailable' });
    const data: { items?: NaverPlace[] } = await response.json();
    if (!Array.isArray(data?.items)) return json(502, { error: 'naver_unavailable' });
    return json(200, { results: data.items.slice(0, 5).map(placeFromResult).filter(place => place !== null) });
  } catch {
    return json(502, { error: 'search_unavailable' });
  }
}
