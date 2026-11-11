-- Run this whole file in the Supabase SQL Editor as the project owner.
-- It is safe to run again. Never run it with a browser/public API key.
begin;

create table if not exists public.wedding_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.wedding_content (
  id text primary key default 'main' check (id = 'main'),
  draft jsonb not null default '{}'::jsonb check (jsonb_typeof(draft) = 'object'),
  published jsonb check (published is null or jsonb_typeof(published) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.wedding_admins enable row level security;
alter table public.wedding_content enable row level security;

-- This function only answers whether the current authenticated user is an
-- administrator. A caller cannot pass another user's ID.
create or replace function public.is_wedding_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.wedding_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_wedding_admin() from public, anon;
grant execute on function public.is_wedding_admin() to authenticated;

revoke all on public.wedding_admins from public, anon, authenticated;
grant select on public.wedding_admins to authenticated;
drop policy if exists "Read own administrator membership" on public.wedding_admins;
create policy "Read own administrator membership"
on public.wedding_admins for select to authenticated
using (user_id = (select auth.uid()));

-- Neither anonymous visitors nor ordinary signed-in users can see drafts,
-- change administrator membership, or update the invitation.
revoke all on public.wedding_content from public, anon, authenticated;
grant select, insert, update on public.wedding_content to authenticated;

drop policy if exists "Administrators read invitation" on public.wedding_content;
create policy "Administrators read invitation"
on public.wedding_content for select to authenticated
using ((select public.is_wedding_admin()));

drop policy if exists "Administrators create invitation" on public.wedding_content;
create policy "Administrators create invitation"
on public.wedding_content for insert to authenticated
with check (id = 'main' and (select public.is_wedding_admin()));

drop policy if exists "Administrators update invitation" on public.wedding_content;
create policy "Administrators update invitation"
on public.wedding_content for update to authenticated
using ((select public.is_wedding_admin()))
with check (id = 'main' and (select public.is_wedding_admin()));

create or replace function public.set_wedding_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_wedding_updated_at() from public, anon, authenticated;
drop trigger if exists wedding_updated_at on public.wedding_content;
create trigger wedding_updated_at
before update on public.wedding_content
for each row execute function public.set_wedding_updated_at();

-- The only anonymous database read. Exposes the published JSON document only;
-- draft content and administrator IDs are never returned. A definer function
-- is used instead of granting visitors SELECT on the underlying table.
create or replace function public.get_published_wedding()
returns table (data jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.published, c.updated_at
  from public.wedding_content as c
  where c.id = 'main' and c.published is not null;
$$;
revoke all on function public.get_published_wedding() from public;
grant execute on function public.get_published_wedding() to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wedding-photos', 'wedding-photos', true, 8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Administrators read wedding photo objects" on storage.objects;
create policy "Administrators read wedding photo objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'wedding-photos'
  and (storage.foldername(name))[1] = 'main'
  and (select public.is_wedding_admin())
);

drop policy if exists "Administrators upload wedding photos" on storage.objects;
create policy "Administrators upload wedding photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'wedding-photos'
  and (storage.foldername(name))[1] = 'main'
  and (select public.is_wedding_admin())
);

drop policy if exists "Administrators update wedding photos" on storage.objects;
create policy "Administrators update wedding photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'wedding-photos'
  and (storage.foldername(name))[1] = 'main'
  and (select public.is_wedding_admin())
)
with check (
  bucket_id = 'wedding-photos'
  and (storage.foldername(name))[1] = 'main'
  and (select public.is_wedding_admin())
);

drop policy if exists "Administrators delete wedding photos" on storage.objects;
create policy "Administrators delete wedding photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'wedding-photos'
  and (storage.foldername(name))[1] = 'main'
  and (select public.is_wedding_admin())
);

commit;

-- NEXT: create the administrator in Authentication > Users, then run the
-- bootstrap query in docs/SETUP.md. Merely signing in grants no edit access.
