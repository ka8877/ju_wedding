import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/venue-search';

const env = {
  VITE_SUPABASE_URL: 'https://wedding-ui-tests.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_test',
  NAVER_SEARCH_CLIENT_ID: 'test-naver-id',
  NAVER_SEARCH_CLIENT_SECRET: 'test-naver-secret',
};

function search(authorization = 'Bearer test-admin-token', query = '분당 예식장') {
  return new Request('https://wedding.example/api/venue-search', {
    method: 'POST', body: JSON.stringify({ query }),
    headers: authorization ? { Authorization: authorization } : {},
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('admin venue search function', () => {
  it('requires a valid wedding administrator before calling Naver', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(false));
    vi.stubGlobal('fetch', fetchMock);
    expect((await onRequest({ request: search(''), env })).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();

    expect((await onRequest({ request: search('Bearer non-admin-token'), env })).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(new URL('/rest/v1/rpc/is_wedding_admin', env.VITE_SUPABASE_URL).href, expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer non-admin-token', apikey: env.VITE_SUPABASE_ANON_KEY }),
    }));
  });

  it('passes the Korean query to Naver and normalizes selected venue data without exposing credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json({ items: [
      { title: '<b>함께</b> &amp; 정원', roadAddress: '경기 성남시 분당구 분당수서로 477', mapx: 1271043929, mapy: 373768838 },
      { title: '다른 예식장', address: '서울 중구 태평로 1', mapx: '0', mapy: '0' },
      null,
    ] }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await onRequest({ request: search(), env });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const [requestUrl, options] = fetchMock.mock.calls[1];
    expect(String(requestUrl)).toMatch(/^https:\/\/naverapihub\.apigw\.ntruss\.com\/search\/v1\/local\?/);
    const params = new URL(requestUrl).searchParams;
    expect(params.get('query')).toBe('분당 예식장');
    expect(params.get('start')).toBe('1');
    expect(options.headers).toEqual({ 'X-NCP-APIGW-API-KEY-ID': env.NAVER_SEARCH_CLIENT_ID, 'X-NCP-APIGW-API-KEY': env.NAVER_SEARCH_CLIENT_SECRET });
    expect(await response.json()).toEqual({ results: [
      { name: '함께 & 정원', address: '경기 성남시 분당구 분당수서로 477', lat: 37.3768838, lng: 127.1043929 },
      { name: '다른 예식장', address: '서울 중구 태평로 1', lat: null, lng: null },
    ] });
  });

  it('distinguishes a permission service failure from a Naver response failure', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('permission service unavailable'))
      .mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json({ details: 'private' }, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    const permissionFailure = await onRequest({ request: search(), env });
    expect(permissionFailure.status).toBe(502);
    expect(await permissionFailure.json()).toEqual({ error: 'admin_check_failed' });
    const naverFailure = await onRequest({ request: search(), env });
    expect(naverFailure.status).toBe(502);
    expect(await naverFailure.json()).toEqual({ error: 'naver_unavailable', upstreamStatus: 400 });
  });

  it('reports unconfigured credentials or a quota limit without returning the upstream error', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json(true))
      .mockResolvedValueOnce(Response.json({ providerDetails: 'private' }, { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const unconfigured = await onRequest({ request: search(), env: { ...env, NAVER_SEARCH_CLIENT_SECRET: '' } });
    expect(unconfigured.status).toBe(503);
    expect(await unconfigured.json()).toEqual({ error: 'naver_unconfigured' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const limited = await onRequest({ request: search(), env });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'naver_limit' });
  });
});
