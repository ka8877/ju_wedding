import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
const admin = '11111111-1111-4111-8111-111111111111';
const stranger = '22222222-2222-4222-8222-222222222222';
const client = '33333333-3333-4333-8333-333333333333';
const client2 = '44444444-4444-4444-8444-444444444444';
const quotaClient = '55555555-5555-4555-8555-555555555555';
const baseMigration = await readFile(new URL('../../supabase/migrations/001_wedding.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../supabase/migrations/002_guest_features.sql', import.meta.url), 'utf8');
let count = 0;
let published;
let uploadedPath;
let unuploadedPath;

async function test(name, work) { await work(); console.log(`PASS guest ${++count}: ${name}`); }
async function as(role, id, work) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
  await db.exec(`set role ${role}`);
  try { return await work(); } finally { await db.exec('reset role'); }
}
async function fails(sql, params, code) {
  await assert.rejects(() => db.query(sql, params), error => {
    assert.equal(error.code, code, `${error.message} (${error.code})`); return true;
  });
}
const payload = (changes = {}) => ({ side: 'bride', attending: true, name: ' 하객 이름 ', phone: '010-1234-5678', guests: 2, meal: 'yes', shuttle: 'daejeon', message: '축하합니다.', consent: true, ...changes });
const submit = (data, token = client) => db.query('select public.submit_wedding_rsvp($1::jsonb, $2::uuid) as receipt', [JSON.stringify(data), token]);
const reserve = (token = client, changes = {}) => {
  const data = { name: '하객', file: '우리의 순간.jpg', mime: 'image/webp', bytes: 1000, ...changes };
  return db.query('select public.reserve_wedding_guest_photo($1::uuid,$2,$3,$4,$5) as receipt', [token, data.name, data.file, data.mime, data.bytes]);
};
async function publish(data) { await db.query("update public.wedding_content set published=$1::jsonb where id='main'", [JSON.stringify(data)]); }

try {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema storage;
    grant usage on schema public, auth, storage to anon, authenticated;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    create table storage.buckets(id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text not null references storage.buckets(id), name text not null, unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1]; $$;
    insert into auth.users values('${admin}','admin@example.test'),('${stranger}','stranger@example.test');
  `);
  await db.exec(baseMigration);
  await db.query('insert into public.wedding_admins(user_id) values($1)', [admin]);
  const future = (await db.query("select to_char((now() at time zone 'Asia/Seoul')::date+1, 'YYYY-MM-DD') as day")).rows[0].day;
  const past = (await db.query("select to_char((now() at time zone 'Asia/Seoul')::date-1, 'YYYY-MM-DD') as day")).rows[0].day;
  published = { date: '2027-02-20', guestFeatures: { rsvp: { enabled: true }, snap: { enabled: true, openDate: future } } };
  await db.query("insert into public.wedding_content(id,draft,published) values('main','{}',$1::jsonb)", [JSON.stringify(published)]);

  await test('additive guest migration applies', () => db.exec(migration));
  await test('public capabilities expose flags and server-enforced future date only', () => as('anon', null, async () => {
    const row = (await db.query('select public.get_wedding_guest_capabilities() as c')).rows[0].c;
    assert.deepEqual(row, { rsvp_enabled: true, snap_enabled: true, snap_open: false, snap_open_date: future });
  }));
  await test('anonymous cannot read or directly insert response/photo tables', () => as('anon', null, async () => {
    for (const table of ['wedding_rsvps', 'wedding_guest_photos']) await fails(`select * from public.${table}`, [], '42501');
    await fails("insert into public.wedding_rsvps(client_token,side,attending,name,guests,meal,shuttle) values($1,'bride',true,'guest',1,'yes','none')", [client], '42501');
    await fails("insert into public.wedding_guest_photos(client_token,file_name,storage_path,content_type,byte_size) values($1,'file.webp','main/forged.webp','image/webp',100)", [client], '42501');
  }));
  await test('anonymous RSVP submit returns receipt only and trims private data', async () => {
    const result = await as('anon', null, () => submit(payload()));
    assert.deepEqual(Object.keys(result.rows[0].receipt).sort(), ['created_at', 'id']);
    assert.ok(result.rows[0].receipt.id);
    const saved = (await db.query('select name,phone,guests from public.wedding_rsvps')).rows[0];
    assert.equal(saved.name, '하객 이름'); assert.equal(saved.phone, '010-1234-5678'); assert.equal(saved.guests, 2);
  });
  await test('invalid consent, counts, phone, types and sides are rejected independently in SQL', () => as('anon', null, async () => {
    for (const changes of [{ consent: false }, { guests: 0 }, { guests: 11 }, { guests: 2.5 }, { phone: 'not a number' }, { name: {} }, { name: '' }, { side: 'other' }, { meal: 'maybe' }]) {
      await fails('select public.submit_wedding_rsvp($1::jsonb,$2::uuid)', [JSON.stringify(payload(changes)), client], '22023');
    }
  }));
  await test('same request token is idempotent while a different person request preserves both responses', async () => {
    const id = (await db.query('select id from public.wedding_rsvps')).rows[0].id;
    await as('anon', null, () => submit(payload({ attending: false, guests: 0, meal: 'yes', shuttle: 'gyeongju' })));
    const saved = (await db.query('select * from public.wedding_rsvps')).rows[0];
    assert.equal(saved.id, id); assert.equal(saved.guests, 0); assert.equal(saved.meal, 'no'); assert.equal(saved.shuttle, 'none');
    await as('anon', null, () => submit(payload({ name: '다른 하객' }), client2));
    assert.equal((await db.query('select count(*)::int as n from public.wedding_rsvps')).rows[0].n, 2);
    assert.deepEqual((await db.query('select name from public.wedding_rsvps order by name')).rows.map(row => row.name), ['다른 하객', '하객 이름']);
  });
  await test('ordinary signed-in user has no private response rows or write access', () => as('authenticated', stranger, async () => {
    assert.deepEqual((await db.query('select * from public.wedding_rsvps')).rows, []);
    assert.deepEqual((await db.query('select * from public.wedding_guest_photos')).rows, []);
    await fails('delete from public.wedding_rsvps', [], '42501');
  }));
  await test('only administrators can read all private responses', () => as('authenticated', admin, async () => {
    const rows = (await db.query('select name,phone from public.wedding_rsvps')).rows;
    assert.equal(rows.length, 2); assert.ok(rows.every(row => row.phone === '010-1234-5678'));
  }));
  await test('turning responses off prevents new anonymous submission', async () => {
    await publish({ ...published, guestFeatures: { ...published.guestFeatures, rsvp: { enabled: false } } });
    await as('anon', null, () => fails('select public.submit_wedding_rsvp($1::jsonb,$2::uuid)', [JSON.stringify(payload()), client], 'P0001'));
    await publish(published);
  });
  await test('unpublished invitation cannot receive RSVP or photos', async () => {
    await db.exec("update public.wedding_content set published=null where id='main'");
    await as('anon', null, async () => {
      const c = (await db.query('select public.get_wedding_guest_capabilities() as c')).rows[0].c;
      assert.equal(c.rsvp_enabled, false); assert.equal(c.snap_open, false);
    });
    await publish(published);
  });
  await test('photo reservation is blocked before the server opening date', () => as('anon', null, async () => {
    await fails('select public.reserve_wedding_guest_photo($1::uuid,$2,$3,$4,$5)', [client, '하객', 'photo.webp', 'image/webp', 100], 'P0001');
    await fails("insert into storage.objects(bucket_id,name) values('wedding-guest-photos','main/early.webp')", [], '42501');
  }));
  await test('opening is determined using a published date and the Korean server calendar', async () => {
    published.guestFeatures.snap.openDate = past; await publish(published);
    await as('anon', null, async () => assert.equal((await db.query('select public.get_wedding_guest_capabilities() as c')).rows[0].c.snap_open, true));
  });
  await test('photo reservation gives one random path and bounded metadata', async () => {
    const result = await as('anon', null, () => reserve());
    const receipt = result.rows[0].receipt; uploadedPath = receipt.storage_path;
    assert.match(uploadedPath, /^main\/[a-f0-9-]{36}\.webp$/);
    assert.deepEqual(Object.keys(receipt).sort(), ['created_at', 'id', 'storage_path']);
    assert.equal((await db.query('select guest_name from public.wedding_guest_photos')).rows[0].guest_name, '하객');
    const retry = await as('anon', null, () => reserve());
    assert.equal(retry.rows[0].receipt.storage_path, uploadedPath, 'Retry reuses its unuploaded path instead of consuming another quota slot');
  });
  await test('anonymous can upload only a reserved path and cannot read, replace or delete files', () => as('anon', null, async () => {
    await fails("insert into storage.objects(bucket_id,name) values('wedding-guest-photos','main/forged.webp')", [], '42501');
    await db.query("insert into storage.objects(bucket_id,name) values('wedding-guest-photos',$1)", [uploadedPath]);
    assert.deepEqual((await db.query('select * from storage.objects')).rows, []);
    assert.deepEqual((await db.query("update storage.objects set name='main/stolen.webp' returning id")).rows, []);
    assert.deepEqual((await db.query('delete from storage.objects returning id')).rows, []);
  }));
  await test('photo list RPC rejects anonymous and ordinary authenticated users', async () => {
    await as('anon', null, () => fails('select * from public.list_wedding_guest_photos()', [], '42501'));
    await as('authenticated', stranger, () => fails('select * from public.list_wedding_guest_photos()', [], '42501'));
  });
  await test('administrator list includes completed storage objects rather than abandoned reservations', async () => {
    const result = await as('anon', null, () => reserve()); unuploadedPath = result.rows[0].receipt.storage_path;
    await as('authenticated', admin, async () => {
      const rows = (await db.query('select * from public.list_wedding_guest_photos()')).rows;
      assert.equal(rows.length, 1); assert.equal(rows[0].storage_path, uploadedPath);
      assert.equal((await db.query("select * from storage.objects where bucket_id='wedding-guest-photos'")).rows.length, 1);
    });
  });
  await test('expired reservations lose upload permission', async () => {
    await db.query("update public.wedding_guest_photos set expires_at=now()-interval '1 minute' where storage_path=$1", [unuploadedPath]);
    await as('anon', null, () => fails("insert into storage.objects(bucket_id,name) values('wedding-guest-photos',$1)", [unuploadedPath], '42501'));
  });
  await test('disabling photos also blocks previously issued paths', async () => {
    const result = await as('anon', null, () => reserve()); const path = result.rows[0].receipt.storage_path;
    await publish({ ...published, guestFeatures: { ...published.guestFeatures, snap: { ...published.guestFeatures.snap, enabled: false } } });
    await as('anon', null, () => fails("insert into storage.objects(bucket_id,name) values('wedding-guest-photos',$1)", [path], '42501'));
    await publish(published);
  });
  await test('bucket is private with a 2MiB image-only API limit', async () => {
    const bucket = (await db.query("select * from storage.buckets where id='wedding-guest-photos'")).rows[0];
    assert.equal(bucket.public, false); assert.equal(Number(bucket.file_size_limit), 2097152);
    assert.deepEqual(bucket.allowed_mime_types, ['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
  });
  await test('invalid image metadata and excessive file sizes are rejected', () => as('anon', null, async () => {
    for (const changes of [{ mime: 'image/svg+xml' }, { bytes: 0 }, { bytes: 2097153 }, { file: 'bad\nname.webp' }, { name: 'x'.repeat(81) }]) {
      const p = { name: '하객', file: 'photo.webp', mime: 'image/webp', bytes: 100, ...changes };
      await fails('select public.reserve_wedding_guest_photo($1::uuid,$2,$3,$4,$5)', [client, p.name, p.file, p.mime, p.bytes], '22023');
    }
  }));
  await test('one client is limited to five photo reservations per hour', () => as('anon', null, async () => {
    for (let index = 0; index < 5; index++) await reserve(quotaClient, { file: `photo-${index}.webp` });
    await fails('select public.reserve_wedding_guest_photo($1::uuid,$2,$3,$4,$5)', [quotaClient, '하객', 'photo.webp', 'image/webp', 100], 'P0001');
  }));
  await test('global reservation ceiling bounds the private photo bucket', async () => {
    const n = (await db.query('select count(*)::int as n from public.wedding_guest_photos')).rows[0].n;
    await db.query("insert into public.wedding_guest_photos(client_token,file_name,storage_path,content_type,byte_size) select gen_random_uuid(),'photo.webp','main/'||gen_random_uuid()||'.webp','image/webp',1 from generate_series(1,$1::int)", [500 - n]);
    await as('anon', null, () => fails('select public.reserve_wedding_guest_photo($1::uuid,$2,$3,$4,$5)', [client2, '하객', 'photo.webp', 'image/webp', 100], 'P0001'));
  });
  await test('migration reruns without deleting responses, photos, admins or published content', async () => {
    await db.exec(migration);
    assert.equal((await db.query('select count(*)::int as n from public.wedding_rsvps')).rows[0].n, 2);
    assert.equal((await db.query('select count(*)::int as n from public.wedding_guest_photos')).rows[0].n, 500);
    assert.equal((await db.query('select count(*)::int as n from public.wedding_admins')).rows[0].n, 1);
    assert.deepEqual((await db.query("select published from public.wedding_content where id='main'")).rows[0].published, published);
    const rows = (await db.query("select relrowsecurity from pg_class where relname in ('wedding_rsvps','wedding_guest_photos')")).rows;
    assert.equal(rows.length, 2); assert.ok(rows.every(row => row.relrowsecurity));
  });
  assert.equal(count, 23);
  console.log(`Completed ${count} guest feature policy checks against real PGlite PostgreSQL.`);
  console.log('Scope: SQL, date gate and RLS execution with mocked Supabase platform schemas. Hosted Auth, Storage API file validation, signed URLs and upload transport need separate verification.');
} finally { await db.close(); }
