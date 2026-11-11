import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
const admin = '11111111-1111-4111-8111-111111111111';
const stranger = '22222222-2222-4222-8222-222222222222';
const migration = await readFile(new URL('../../supabase/migrations/001_wedding.sql', import.meta.url), 'utf8');
let count = 0;
async function test(name, work) {
  await work();
  count++;
  console.log(`PASS ${count}: ${name}`);
}
async function denied(sql, params = []) {
  try { await db.query(sql, params); }
  catch (error) {
    assert.equal(error.code, '42501', `Expected insufficient_privilege, received ${error.code}: ${error.message}`);
    return;
  }
  throw new Error(`Expected denied SQL: ${sql}`);
}
async function as(role, id, work) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
  await db.exec(`set role ${role}`);
  try { await work(); }
  finally { await db.exec('reset role'); }
}

// In-memory PostgreSQL, with only the Supabase platform schemas mocked.
// This script never connects to a Supabase project or needs credentials.
try {
  await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create schema storage;
  grant usage on schema public, auth, storage to anon, authenticated;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id),
    name text not null,
    unique(bucket_id, name)
  );
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
  $$;
  insert into auth.users values
    ('${admin}', 'bride@example.test'),
    ('${stranger}', 'stranger@example.test');
  `);

  await test('migration executes in embedded PostgreSQL', () => db.exec(migration));
  await test('bucket metadata declares public flag, 8 MiB and image MIME allowlist', async () => {
    const {rows} = await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'wedding-photos'");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].public, true);
    assert.equal(Number(rows[0].file_size_limit), 8388608);
    assert.deepEqual(rows[0].allowed_mime_types, ['image/jpeg','image/png','image/webp','image/avif']);
  });
  await test('anonymous gets empty RPC before first publication and cannot read draft/admin tables or helper', async () => {
    await as('anon', null, async () => {
      assert.deepEqual((await db.query('select * from public.get_published_wedding()')).rows, []);
      await denied('select * from public.wedding_content');
      await denied('select * from public.wedding_admins');
      await denied('select public.is_wedding_admin()');
    });
  });
  await test('anonymous cannot create invitation, administrator membership or photo object', async () => {
    await as('anon', null, async () => {
      await denied("insert into public.wedding_content(id,draft) values ('main','{}')");
      await denied('insert into public.wedding_admins(user_id) values ($1)', [stranger]);
      await denied("insert into storage.objects(bucket_id,name) values ('wedding-photos','main/anon.webp')");
    });
  });
  await test('ordinary signed-in user has no membership or draft visibility and cannot write', async () => {
    await as('authenticated', stranger, async () => {
      assert.equal((await db.query('select public.is_wedding_admin() as allowed')).rows[0].allowed, false);
      assert.deepEqual((await db.query('select * from public.wedding_content')).rows, []);
      assert.deepEqual((await db.query('select * from public.wedding_admins')).rows, []);
      await denied('insert into public.wedding_admins(user_id) values ($1)', [stranger]);
      await denied("insert into public.wedding_content(id,draft) values ('main','{}')");
      await denied("insert into storage.objects(bucket_id,name) values ('wedding-photos','main/stranger.webp')");
    });
  });
  await db.query('insert into public.wedding_admins(user_id) values ($1)', [admin]);
  await test('registered administrator can read own membership and create draft', async () => {
    await as('authenticated', admin, async () => {
      assert.equal((await db.query('select public.is_wedding_admin() as allowed')).rows[0].allowed, true);
      assert.equal((await db.query('select * from public.wedding_admins')).rows.length, 1);
      await db.query("insert into public.wedding_content(id,draft) values ('main',$1::jsonb)", [JSON.stringify({version:1, invitation:'DRAFT ONLY'})]);
      assert.equal((await db.query('select draft from public.wedding_content')).rows[0].draft.invitation, 'DRAFT ONLY');
    });
  });
  await test('unpublished draft stays unavailable through anonymous public RPC', async () => {
    await as('anon', null, async () => assert.deepEqual((await db.query('select * from public.get_published_wedding()')).rows, []));
  });
  await test('administrator can publish and anonymous sees only published payload', async () => {
    await as('authenticated', admin, async () => {
      await db.query("update public.wedding_content set published=$1::jsonb where id='main'", [JSON.stringify({version:1, invitation:'PUBLIC INVITATION'})]);
    });
    await as('anon', null, async () => {
      const rows = (await db.query('select * from public.get_published_wedding()')).rows;
      assert.equal(rows.length, 1);
      assert.deepEqual(Object.keys(rows[0]).sort(), ['data','updated_at']);
      assert.equal(rows[0].data.invitation, 'PUBLIC INVITATION');
      assert.equal(JSON.stringify(rows).includes('DRAFT ONLY'), false);
      await denied('select draft from public.wedding_content');
    });
  });
  await test('draft-only upsert preserves existing publication', async () => {
    await as('authenticated', admin, async () => {
      await db.query("insert into public.wedding_content (id,draft) values ('main',$1::jsonb) on conflict(id) do update set draft=excluded.draft", [JSON.stringify({version:1, invitation:'NEW PRIVATE DRAFT'})]);
      const row = (await db.query('select draft,published from public.wedding_content')).rows[0];
      assert.equal(row.draft.invitation, 'NEW PRIVATE DRAFT');
      assert.equal(row.published.invitation, 'PUBLIC INVITATION');
    });
  });
  await test('non-administrator update affects zero rows after invitation exists', async () => {
    await as('authenticated', stranger, async () => {
      const rows=(await db.query("update public.wedding_content set published='{}'::jsonb where id='main' returning id")).rows;
      assert.deepEqual(rows, []);
    });
  });
  await test('administrator may upload/read/update/delete main folder photo objects', async () => {
    await as('authenticated', admin, async () => {
      await db.exec("insert into storage.objects(bucket_id,name) values ('wedding-photos','main/admin.webp')");
      assert.equal((await db.query('select name from storage.objects')).rows.length,1);
      await db.exec("update storage.objects set name='main/admin-renamed.webp' where name='main/admin.webp'");
      assert.equal((await db.query('select name from storage.objects')).rows[0].name,'main/admin-renamed.webp');
    });
  });
  await test('administrator cannot write outside main folder or move photo out of it', async () => {
    await as('authenticated', admin, async () => {
      await denied("insert into storage.objects(bucket_id,name) values ('wedding-photos','other/unauthorized.webp')");
      await denied("update storage.objects set name='other/moved.webp' where name='main/admin-renamed.webp'");
    });
  });
  await test('non-administrator cannot see/update/delete existing photo metadata', async () => {
    await as('authenticated', stranger, async () => {
      assert.deepEqual((await db.query('select * from storage.objects')).rows, []);
      assert.deepEqual((await db.query("update storage.objects set name='main/hacked.webp' returning id")).rows, []);
      assert.deepEqual((await db.query('delete from storage.objects returning id')).rows, []);
    });
    await as('anon', null, async () => {
      assert.deepEqual((await db.query('select * from storage.objects')).rows, []);
      assert.deepEqual((await db.query('delete from storage.objects returning id')).rows, []);
    });
  });
  await test('administrator can delete main folder photo metadata', async () => {
    await as('authenticated', admin, async () => assert.equal((await db.query('delete from storage.objects returning id')).rows.length,1));
  });
  await test('anonymous public RPC remains correct after rejected modifications', async () => {
    await as('anon', null, async () => assert.equal((await db.query('select * from public.get_published_wedding()')).rows[0].data.invitation,'PUBLIC INVITATION'));
  });
  await test('migration reruns successfully without deleting invitation or administrator', async () => {
    await db.exec(migration);
    assert.equal((await db.query('select count(*)::int as n from public.wedding_admins')).rows[0].n,1);
    const row=(await db.query('select draft,published from public.wedding_content')).rows[0];
    assert.equal(row.draft.invitation,'NEW PRIVATE DRAFT');
    assert.equal(row.published.invitation,'PUBLIC INVITATION');
  });
  await test('RLS flags remain enabled after rerun', async () => {
    const rows=(await db.query("select relname,relrowsecurity from pg_class where relname in ('wedding_admins','wedding_content','objects') order by relname")).rows;
    assert.equal(rows.length,3);
    assert.equal(rows.every(r=>r.relrowsecurity),true);
  });
  assert.equal(count, 17, 'All expected policy checks must execute');
  console.log(`Completed ${count} policy checks against PGlite PostgreSQL ${JSON.stringify((await db.query('select version()')).rows[0])}.`);
  console.log('Scope: actual PostgreSQL SQL/RLS execution with mocked Supabase schemas/roles. Does not test hosted Supabase Auth, PostgREST HTTP, Storage API MIME/size enforcement, or CDN delivery.');
} finally {
  await db.close();
}
