import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultWedding } from '../src/lib/defaults';
import type { WeddingData } from '../src/lib/types';

type StorageModule = typeof import('../src/lib/storage');
type Call = { method: string; path: string; query: URLSearchParams; headers: Headers; body: Record<string, unknown> | null };
type Scenario = {
  writeError?: boolean;
  noWriteRow?: boolean;
  nullWriteRow?: boolean;
  missingRpc?: boolean;
  noPublicRows?: boolean;
  mismatch?: boolean;
  reverseKeys?: boolean;
};

const projectUrl = 'https://storage-regression.supabase.co';
const publicKey = 'sb_publishable_regressionOnly';
const serverTime = '2030-06-01T05:00:00.000Z';
const userId = '11111111-1111-4111-8111-111111111111';
let storage: StorageModule;
let calls: Call[];
let scenario: Scenario;
let written: Record<string, unknown> | null;

function reversedObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversedObjectKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reversedObjectKeys(item)]));
  return value;
}
function invitation(): WeddingData {
  const data = structuredClone(defaultWedding);
  // Keep the deliberately incomplete-event regression separate from the real couple defaults.
  data.date = ''; data.time = '';
  data.venue.name = ''; data.venue.hall = ''; data.venue.address = '';
  data.invitation = '사진과 장소를 준비하며, 새로운 디자인을 먼저 보여 드립니다.';
  data.design.heroTitle = 'Our beautiful\nbeginning.';
  data.theme = 'lavender';
  return data;
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('VITE_LOCAL_PREVIEW', 'false');
  vi.stubEnv('VITE_SUPABASE_URL', projectUrl);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', publicKey);
  calls = []; scenario = {}; written = null;
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const text = await request.text();
    const body = text ? JSON.parse(text) as Record<string, unknown> : null;
    calls.push({ method: request.method, path: url.pathname, query: url.searchParams, headers: request.headers, body });
    if (url.origin !== projectUrl) throw new Error('An unexpected external destination was requested');
    if (url.pathname === '/auth/v1/user') {
      return json({ id: userId, aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
    }
    if (url.pathname === '/rest/v1/wedding_content' && request.method === 'POST') {
      if (scenario.writeError) return json({ code: '42501', message: 'new row violates row-level security policy' }, 403);
      if (scenario.noWriteRow) return json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows' }, 406);
      if (scenario.nullWriteRow) return json(null);
      written = body;
      return json({ updated_at: serverTime });
    }
    if (url.pathname === '/rest/v1/rpc/get_published_wedding') {
      if (scenario.missingRpc) return json({ code: 'PGRST202', message: 'Could not find the function public.get_published_wedding' }, 404);
      if (scenario.noPublicRows) return json([]);
      const data = structuredClone(written?.published ?? invitation()) as WeddingData;
      if (scenario.mismatch) data.invitation = '다른 관리자가 공개한 내용';
      return json([{ data: scenario.reverseKeys ? reversedObjectKeys(data) : data, updated_at: serverTime }]);
    }
    throw new Error(`Unexpected mocked endpoint ${request.method} ${url.pathname}`);
  }));
  storage = await import('../src/lib/storage');
});

afterEach(async () => {
  await storage?.supabase?.auth.stopAutoRefresh();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('publishing through the actual Supabase SDK with mocked HTTP', () => {
  it('publishes a design-only invitation with unknown event details and verifies the guest readback', async () => {
    const data = invitation();
    expect(data.date).toBe(''); expect(data.time).toBe(''); expect(data.venue.name).toBe('');
    expect(await storage.publishWedding(data)).toBe(serverTime);
    const write = calls.find(call => call.path === '/rest/v1/wedding_content');
    expect(write).toBeDefined();
    expect(write?.method).toBe('POST');
    expect(write?.query.get('on_conflict')).toBe('id');
    expect(write?.query.get('select')).toBe('updated_at');
    expect(write?.headers.get('accept')).toBe('application/vnd.pgrst.object+json');
    expect(write?.headers.get('prefer')).toContain('resolution=merge-duplicates');
    expect(write?.headers.get('prefer')).toContain('return=representation');
    expect(write?.body?.id).toBe('main');
    expect(write?.body?.draft).toEqual(data);
    expect(write?.body?.published).toEqual(data);
    const reads = calls.filter(call => call.path === '/rest/v1/rpc/get_published_wedding');
    expect(reads).toHaveLength(1);
    expect(reads[0].method).toBe('POST');
    expect(reads[0].headers.get('apikey')).toBe(publicKey);
    expect(reads[0].headers.get('authorization')).toBe(`Bearer ${publicKey}`);
  });

  it('accepts PostgreSQL JSONB object-key reordering without changing array order', async () => {
    scenario.reverseKeys = true;
    expect(await storage.publishWedding(invitation())).toBe(serverTime);
  });

  it('rejects a denied write before attempting to verify or claim public success', async () => {
    scenario.writeError = true;
    await expect(storage.publishWedding(invitation())).rejects.toThrow(/공개.*확인하지 못했습니다/);
    expect(calls.filter(call => call.path.includes('/rpc/'))).toHaveLength(0);
  });

  it('rejects an upsert returning no row under the single-object response contract', async () => {
    scenario.noWriteRow = true;
    await expect(storage.publishWedding(invitation())).rejects.toThrow(/공개.*확인하지 못했습니다/);
    expect(calls.filter(call => call.path.includes('/rpc/'))).toHaveLength(0);
  });

  it('rejects an HTTP 200 null single-row response instead of claiming a successful publication', async () => {
    scenario.nullWriteRow = true;
    await expect(storage.publishWedding(invitation())).rejects.toThrow(/공개.*확인하지 못했습니다/);
    expect(calls.filter(call => call.path.includes('/rpc/'))).toHaveLength(0);
  });

  it('rejects missing public RPC even after the content write succeeds', async () => {
    scenario.missingRpc = true;
    await expect(storage.publishWedding(invitation())).rejects.toThrow('공개 반영 여부를 확인하지 못했어요');
    expect(written?.published).toEqual(invitation());
  });

  it('rejects an empty guest readback after the content write succeeds', async () => {
    scenario.noPublicRows = true;
    await expect(storage.publishWedding(invitation())).rejects.toThrow('저장한 청첩장을 확인하지 못했어요');
  });

  it('rejects a guest document that differs from the intended publication', async () => {
    scenario.mismatch = true;
    await expect(storage.publishWedding(invitation())).rejects.toThrow('하객용 청첩장 내용이 일치하지 않습니다');
  });

  it('saves only the draft without sending a published field and uses the server timestamp', async () => {
    const data = invitation();
    expect(await storage.saveDraft(data)).toBe(serverTime);
    const write = calls.find(call => call.path === '/rest/v1/wedding_content');
    expect(write?.query.get('select')).toBe('updated_at');
    expect(write?.headers.get('accept')).toBe('application/vnd.pgrst.object+json');
    expect(write?.body?.draft).toEqual(data);
    expect(write?.body).not.toHaveProperty('published');
    expect(calls.filter(call => call.path.includes('/rpc/'))).toHaveLength(0);
  });

  it('keeps the public readback anonymous while the write uses a logged-in administrator token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
    const adminToken = `${header}.${payload}.test-signature`;
    const session = await storage.supabase!.auth.setSession({ access_token: adminToken, refresh_token: 'test-refresh-token' });
    expect(session.error).toBeNull();
    expect(await storage.publishWedding(invitation())).toBe(serverTime);
    const write = calls.find(call => call.path === '/rest/v1/wedding_content');
    const read = calls.find(call => call.path === '/rest/v1/rpc/get_published_wedding');
    expect(write?.headers.get('authorization')).toBe(`Bearer ${adminToken}`);
    expect(read?.headers.get('authorization')).toBe(`Bearer ${publicKey}`);
    expect(read?.headers.get('authorization')).not.toContain(adminToken);
  });
});
