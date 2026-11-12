import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RsvpInput, RsvpRecord } from '../src/lib/guest-types';

type GuestModule = typeof import('../src/lib/guest-storage');
type StorageModule = typeof import('../src/lib/storage');
const projectUrl = 'https://guest-test.supabase.co';
const publicKey = 'sb_publishable_guestTest';
const userId = '11111111-1111-4111-8111-111111111111';
const serverTime = '2027-02-20T03:30:00.000Z';
const input = (changes: Partial<RsvpInput> = {}): RsvpInput => ({ side: 'bride', attending: true, name: ' 하객 이름 ', phone: '010-1234-5678', guests: 2, meal: 'yes', shuttle: 'daejeon', message: ' 축하합니다. ', consent: true, ...changes });
let guest: GuestModule;
let storage: StorageModule;
let scenario: 'ready' | 'missing' | 'network' | 'malformed' | 'write-denied' | 'bad-receipt';
let calls: { path: string; body: unknown; authorization: string | null }[];
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('VITE_LOCAL_PREVIEW', 'false');
  vi.stubEnv('VITE_SUPABASE_URL', projectUrl);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', publicKey);
  scenario = 'ready'; calls = [];
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (url, init) => {
    const request = new Request(url, init);
    const path = new URL(request.url).pathname;
    const rawBody = await request.text();
    calls.push({ path, body: rawBody ? JSON.parse(rawBody) : null, authorization: request.headers.get('authorization') });
    if (scenario === 'network') throw new TypeError('offline diagnostic must not leak');
    if (path === '/auth/v1/user') return response({ id: userId, aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: serverTime });
    if (scenario === 'missing') return response({ code: 'PGRST202', message: 'function missing' }, 404);
    if (path === '/rest/v1/rpc/get_wedding_guest_capabilities') return response(scenario === 'malformed' ? { rsvp_enabled: 'yes' } : { rsvp_enabled: true, snap_enabled: true, snap_open: false, snap_open_date: '2027-02-20' });
    if (path === '/rest/v1/rpc/submit_wedding_rsvp') {
      if (scenario === 'write-denied') return response({ code: 'P0001', message: 'closed' }, 400);
      return response(scenario === 'bad-receipt' ? {} : { id: '33333333-3333-4333-8333-333333333333', created_at: serverTime });
    }
    throw new Error(`Unexpected mocked request ${path}`);
  }));
  guest = await import('../src/lib/guest-storage');
  storage = await import('../src/lib/storage');
});
afterEach(async () => { await storage?.supabase?.auth.stopAutoRefresh(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('guest readiness and actual SDK submissions', () => {
  it('distinguishes ready but not-yet-open photo collection from missing storage', async () => {
    expect(await guest.getGuestCapabilities()).toEqual({ status: 'ready', rsvpEnabled: true, snapEnabled: true, snapOpen: false, snapOpenDate: '2027-02-20', message: '' });
    scenario = 'missing';
    const missing = await guest.getGuestCapabilities();
    expect(missing.status).toBe('setup-required'); expect(missing.snapOpen).toBe(false);
    expect(missing.message).not.toContain('SQL');
  });
  it('reports network failures without leaking diagnostics or assuming feature readiness', async () => {
    scenario = 'network';
    const result = await guest.getGuestCapabilities();
    expect(result.status).toBe('offline'); expect(result.rsvpEnabled).toBe(false);
    expect(result.message).not.toContain('diagnostic');
  });
  it('does not accept malformed capability responses', async () => {
    scenario = 'malformed'; expect((await guest.getGuestCapabilities()).status).toBe('setup-required');
  });
  it('submits validated private data through RPC and requires a server receipt', async () => {
    expect(await guest.submitRsvp(input())).toEqual({ id: '33333333-3333-4333-8333-333333333333', createdAt: serverTime });
    const call = calls.find(c => c.path.endsWith('/submit_wedding_rsvp'))!;
    const payload = call.body as { p_payload: RsvpInput; p_client_token: string };
    expect(payload.p_payload.name).toBe('하객 이름'); expect(payload.p_payload.message).toBe('축하합니다.');
    expect(payload.p_client_token).toMatch(/^[a-f0-9-]{36}$/);
    scenario = 'bad-receipt'; await expect(guest.submitRsvp(input())).rejects.toThrow('접수 결과');
  });
  it('keeps guest RPC requests anonymous when the same browser is signed into the editor', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const token = `${header}.${payload}.test-signature`;
    expect((await storage.supabase!.auth.setSession({ access_token: token, refresh_token: 'test-refresh' })).error).toBeNull();
    await guest.submitRsvp(input());
    expect(calls.find(c => c.path.endsWith('/submit_wedding_rsvp'))?.authorization).toBe(`Bearer ${publicKey}`);
  });
  it('does not claim a declined or unavailable submission succeeded', async () => {
    scenario = 'write-denied'; await expect(guest.submitRsvp(input())).rejects.toThrow('접수할 수 없어요');
    scenario = 'missing'; await expect(guest.submitRsvp(input())).rejects.toThrow('접수를 준비');
  });
  it('uses each form request token, retaining retry idempotency without overwriting another person', async () => {
    const first = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await guest.submitRsvp(input({ name: '첫 번째 하객' }), first);
    await guest.submitRsvp(input({ name: '첫 번째 하객' }), first);
    await guest.submitRsvp(input({ name: '다른 하객' }), second);
    const requests = calls.filter(c => c.path.endsWith('/submit_wedding_rsvp')).map(c => c.body as { p_client_token: string });
    expect(requests.map(r => r.p_client_token)).toEqual([first, first, second]);
    await expect(guest.submitRsvp(input(), 'not-a-request-token')).rejects.toThrow('창을 닫고 다시 열어');
    expect(calls).toHaveLength(3);
  });
  it('local previews never send or pretend to persist personal responses', async () => {
    vi.stubEnv('VITE_LOCAL_PREVIEW', 'true'); vi.resetModules();
    const local = await import('../src/lib/guest-storage');
    expect((await local.getGuestCapabilities()).status).toBe('local');
    await expect(local.submitRsvp(input())).rejects.toThrow('실제 응답');
    expect(calls).toEqual([]);
  });
});

describe('RSVP validation and Excel-compatible export', () => {
  it('normalizes a declined response without carrying hidden meal/bus choices', () => {
    expect(guest.validateRsvpInput(input({ attending: false, guests: 3 }))).toMatchObject({ name: '하객 이름', guests: 0, meal: 'no', shuttle: 'none' });
  });
  it('rejects missing consent, invalid counts, oversized or malformed contact details before a request', async () => {
    for (const changes of [{ consent: false }, { guests: 0 }, { guests: 11 }, { guests: 2.5 }, { name: '' }, { phone: 'hello' }, { phone: '010\n12345678' }, { message: 'x'.repeat(1001) }]) {
      await expect(guest.submitRsvp(input(changes))).rejects.toThrow();
    }
    expect(calls).toEqual([]);
  });
  it('exports UTF-8 BOM, quoted multiline text, Korean labels and formula-safe cells', () => {
    const record: RsvpRecord = { ...input({ name: ' =HYPERLINK("https://invalid.example")', message: '축하, 또 축하\n함께해요' }), id: 'receipt', createdAt: serverTime };
    const csv = guest.rsvpsToCsv([record]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"\' =HYPERLINK(""https://invalid.example"")"');
    expect(csv).toContain('"축하, 또 축하\n함께해요"');
    expect(csv).toContain('"신부측"'); expect(csv).toContain('"대전"'); expect(csv).toContain('"참석"');
    expect(csv).toContain('오후 12:30:00');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
