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
  mapx?: string | number;
  mapy?: string | number;
}

const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', '#39': "'" };

function placeFromResult(item: NaverPlace): VenueSearchResult | null {
  if (typeof item?.title !== 'string') return null;
  const name = item.title.replace(/<\/?b>/gi, '').replace(/&(amp|quot|apos|lt|gt|nbsp|#39);/g, (_, key: string) => entities[key]).trim().slice(0, 100);
  const roadAddress = typeof item.roadAddress === 'string' ? item.roadAddress.trim() : '';
  const address = (roadAddress || (typeof item.address === 'string' ? item.address.trim() : '')).slice(0, 300);
  if (!name || !address) return null;

  const x = parseCoordinate(item.mapx);
  const y = parseCoordinate(item.mapy);
  // Naver may represent WGS84 coordinates as degrees multiplied by 10^7.
  const scale = Math.abs(x) > 180 || Math.abs(y) > 90 ? 10_000_000 : 1;
  const lat = y / scale;
  const lng = x / scale;
  const validCoordinates = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);
  return { name, address, lat: validCoordinates ? lat : null, lng: validCoordinates ? lng : null };
}

function parseCoordinate(value: unknown): number {
  if (typeof value === 'number') return value;
  return typeof value === 'string' && value.trim() ? Number(value) : NaN;
}

function json(status: number, body: object) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function fetchWithTimeout(url: URL, options: RequestInit, milliseconds: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try { return await fetch(url.href, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

export async function onRequest({ request, env }: { request: Request; env: SearchBindings }): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  const authorization = request.headers.get('Authorization');
  if (!authorization || !/^Bearer [\w.-]+$/i.test(authorization)) return json(401, { error: 'login_required' });

  const body: { query?: unknown } | null = await request.json().catch(() => null);
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  if (!query || query.length > 150) return json(400, { error: 'invalid_query' });

  let stage: 'admin_check_failed' | 'naver_connection_failed' | 'naver_invalid_response' = 'admin_check_failed';
  try {
    const projectUrl = env.VITE_SUPABASE_URL?.trim() || publicSupabaseConfig.url;
    const projectKey = env.VITE_SUPABASE_ANON_KEY?.trim() || publicSupabaseConfig.key;
    const admin = await fetchWithTimeout(new URL('/rest/v1/rpc/is_wedding_admin', projectUrl), {
      method: 'POST', headers: { Authorization: authorization, apikey: projectKey, 'Content-Type': 'application/json' },
      body: '{}', redirect: 'error',
    }, 5_000);
    if (admin.status === 401) return json(401, { error: 'login_required' });
    if (admin.status === 403) return json(403, { error: 'admin_required' });
    if (!admin.ok) return json(502, { error: stage, upstreamStatus: admin.status });
    if (await admin.json() !== true) return json(403, { error: 'admin_required' });

    const clientId = env.NAVER_SEARCH_CLIENT_ID?.trim();
    const clientSecret = env.NAVER_SEARCH_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return json(503, { error: 'naver_unconfigured' });

    stage = 'naver_connection_failed';
    const url = new URL(`https://naverapihub.apigw.ntruss.com/search/v1/local?query=${encodeURIComponent(query)}&display=5&start=1&sort=random&format=json`);
    const response = await fetchWithTimeout(url, {
      headers: { 'X-NCP-APIGW-API-KEY-ID': clientId, 'X-NCP-APIGW-API-KEY': clientSecret },
      redirect: 'error',
    }, 7_000);
    if (response.status === 429) return json(429, { error: 'naver_limit' });
    if (response.status === 401 || response.status === 403) return json(503, { error: 'naver_auth_failed', upstreamStatus: response.status });
    if (!response.ok) return json(502, { error: 'naver_unavailable', upstreamStatus: response.status });
    stage = 'naver_invalid_response';
    const data: { items?: NaverPlace[] } = await response.json();
    if (!Array.isArray(data?.items)) return json(502, { error: stage });
    return json(200, { results: data.items.slice(0, 5).map(placeFromResult).filter(place => place !== null) });
  } catch {
    return json(502, { error: stage });
  }
}
