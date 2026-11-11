import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { connectionConfig, checkConnection, ConnectionError } from '../scripts/check-supabase.mjs';
import { defaultWedding } from '../src/lib/defaults';

const fallback = { url: 'https://exampleproject.supabase.co', key: 'sb_publishable_exampleOnly' };
const config = () => connectionConfig({}, fallback);
const safeDenied = [{ status: 403, body: { code: '42501' } }, { status: 401, body: { code: '42501' } }];
const bucket = { status: 400, body: { message: 'Object not found', error: 'not_found' } };
const mock = (responses: { status: number; body: unknown }[]) => {
  let index = 0;
  return async (url: string, opts: RequestInit) => {
    assert.ok(url.startsWith(fallback.url));
    const headers = opts.headers as Record<string, string>;
    assert.equal(headers.apikey, fallback.key);
    assert.equal(headers.Authorization, undefined);
    assert.ok((opts.method ?? 'GET') === (url.includes('/rpc/') ? 'POST' : 'GET'));
    const result = responses[index++];
    assert.ok(result, 'Unexpected network probe');
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'content-type': 'application/json' } });
  };
};

describe('read-only Supabase connection helper configuration', () => {
  it('uses checked-in public defaults when overrides are absent', () => {
    assert.equal(config().url, fallback.url);
    assert.equal(config().key, fallback.key);
  });
  it('uses a complete explicit environment override', () => {
    assert.equal(connectionConfig({ VITE_SUPABASE_URL: 'https://otherproject.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_other' }, fallback).url, 'https://otherproject.supabase.co');
  });
  it('rejects half of an environment override', () => {
    assert.throws(() => connectionConfig({ VITE_SUPABASE_URL: fallback.url }, fallback), ConnectionError);
    assert.throws(() => connectionConfig({ VITE_SUPABASE_ANON_KEY: fallback.key }, fallback), ConnectionError);
  });
  it('reports a missing configuration before any network operation', () => {
    assert.throws(() => connectionConfig({}, {}), ConnectionError);
  });
  it('rejects secret and service-role keys without repeating their values', () => {
    const serviceRole = `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.x`;
    for (const key of ['sb_secret_privateValue', serviceRole]) {
      assert.throws(() => connectionConfig({}, { ...fallback, key }), e => e instanceof ConnectionError && !e.message.includes(key));
    }
  });
  it('supports legacy anon JWT keys', () => {
    const key = `x.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.x`;
    assert.equal(connectionConfig({}, { ...fallback, key }).legacyAnon, true);
  });
  it('rejects HTTP, URL credentials, unexpected hosts and URL paths', () => {
    for (const url of ['http://exampleproject.supabase.co', 'https://a:b@exampleproject.supabase.co', 'https://exampleproject.supabase.co/path', 'https://example.org']) {
      assert.throws(() => connectionConfig({}, { ...fallback, url }), ConnectionError);
    }
  });
});

describe('connection probes with mocked HTTP responses', () => {
  it('accepts an unpublished project only after four read-only checks, without key logging', async () => {
    const logs: string[] = [];
    const out = await checkConnection(config(), mock([{ status: 200, body: [] }, ...safeDenied, bucket]), text => logs.push(text));
    assert.deepEqual(out, { published: false, checks: 4 });
    assert.ok(logs.every(text => !text.includes(fallback.key)));
  });
  it('accepts a published invitation and normalizes additive design defaults', async () => {
    const wedding = { ...structuredClone(defaultWedding), design: undefined };
    const out = await checkConnection(config(), mock([{ status: 200, body: [{ data: wedding, updated_at: new Date().toISOString() }] }, ...safeDenied, bucket]), () => {});
    assert.equal(out.published, true);
  });
  it('rejects a malformed published document', async () => {
    await assert.rejects(() => checkConnection(config(), mock([{ status: 200, body: [{ data: {}, updated_at: new Date().toISOString() }] }]), () => {}), ConnectionError);
  });
  it('rejects an allowed anonymous draft read even when its result is empty', async () => {
    await assert.rejects(() => checkConnection(config(), mock([{ status: 200, body: [] }, { status: 200, body: [] }]), () => {}), ConnectionError);
  });
  it('reports the missing SQL prerequisite for an absent RPC', async () => {
    await assert.rejects(() => checkConnection(config(), mock([{ status: 404, body: { code: 'PGRST202' } }]), () => {}), e => e instanceof ConnectionError && e.message.includes('001_wedding.sql'));
  });
  it('rejects an unavailable public photo bucket', async () => {
    await assert.rejects(() => checkConnection(config(), mock([{ status: 200, body: [] }, ...safeDenied, { status: 400, body: { error: 'Bucket not found' } }]), () => {}), ConnectionError);
  });
  it('replaces raw provider diagnostics with a safe error', async () => {
    await assert.rejects(() => checkConnection(config(), async () => { throw new Error('unexpected private diagnostic'); }, () => {}), e => e instanceof ConnectionError && !e.message.includes('private diagnostic'));
  });
});
