-- Run after 001_wedding.sql in the Supabase SQL Editor as project owner.
-- This migration is additive and can be run again without removing responses.
begin;

create table if not exists public.wedding_rsvps (
  id uuid primary key default gen_random_uuid(),
  client_token uuid not null,
  side text not null check (side in ('groom', 'bride')),
  attending boolean not null,
  name text not null check (char_length(name) between 1 and 80),
  phone text not null default '' check (char_length(phone) <= 30),
  guests integer not null check (guests between 0 and 10),
  meal text not null check (meal in ('yes', 'no', 'undecided')),
  shuttle text not null check (shuttle in ('none', 'daejeon', 'gyeongju')),
  message text not null default '' check (char_length(message) <= 1000),
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_token, side),
  check ((attending and guests between 1 and 10) or (not attending and guests = 0))
);

create table if not exists public.wedding_guest_photos (
  id uuid primary key default gen_random_uuid(),
  client_token uuid not null,
  guest_name text not null default '' check (char_length(guest_name) <= 80),
  file_name text not null check (char_length(file_name) between 1 and 120),
  storage_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  byte_size integer not null check (byte_size between 1 and 2097152),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);
create index if not exists wedding_guest_photos_client_time on public.wedding_guest_photos (client_token, created_at);

alter table public.wedding_rsvps enable row level security;
alter table public.wedding_guest_photos enable row level security;
revoke all on public.wedding_rsvps, public.wedding_guest_photos from public, anon, authenticated;
grant select on public.wedding_rsvps, public.wedding_guest_photos to authenticated;

drop policy if exists "Administrators read attendance responses" on public.wedding_rsvps;
create policy "Administrators read attendance responses" on public.wedding_rsvps
for select to authenticated using ((select public.is_wedding_admin()));
drop policy if exists "Administrators read guest photo reservations" on public.wedding_guest_photos;
create policy "Administrators read guest photo reservations" on public.wedding_guest_photos
for select to authenticated using ((select public.is_wedding_admin()));

-- Only safe availability flags are public; no draft, respondent or photo data.
create or replace function public.get_wedding_guest_capabilities()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  content jsonb;
  date_text text;
  opens date := date '2027-02-20';
  rsvp_enabled boolean := false;
  snap_enabled boolean := false;
begin
  select published into content from public.wedding_content where id = 'main';
  if content is not null then
    rsvp_enabled := coalesce(content #> '{guestFeatures,rsvp,enabled}', 'true'::jsonb) = 'true'::jsonb;
    snap_enabled := coalesce(content #> '{guestFeatures,snap,enabled}', 'true'::jsonb) = 'true'::jsonb;
    date_text := coalesce(nullif(content #>> '{guestFeatures,snap,openDate}', ''), nullif(content ->> 'date', ''), '2027-02-20');
    begin
      if date_text ~ '^\d{4}-\d{2}-\d{2}$' then opens := date_text::date; end if;
    exception when datetime_field_overflow or invalid_datetime_format then
      opens := date '2027-02-20';
    end;
  end if;
  return jsonb_build_object(
    'rsvp_enabled', rsvp_enabled, 'snap_enabled', snap_enabled,
    'snap_open', snap_enabled and (now() at time zone 'Asia/Seoul')::date >= opens,
    'snap_open_date', to_char(opens, 'YYYY-MM-DD')
  );
end;
$$;
revoke all on function public.get_wedding_guest_capabilities() from public;
grant execute on function public.get_wedding_guest_capabilities() to anon, authenticated;

create or replace function public.submit_wedding_rsvp(p_payload jsonb, p_client_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  entry public.wedding_rsvps;
  response_name text := btrim(coalesce(p_payload ->> 'name', ''));
  response_phone text := btrim(coalesce(p_payload ->> 'phone', ''));
  response_message text := btrim(coalesce(p_payload ->> 'message', ''));
  response_guests integer;
  response_attending boolean;
begin
  if not (public.get_wedding_guest_capabilities() ->> 'rsvp_enabled')::boolean then
    raise exception 'Attendance responses are not open' using errcode = 'P0001';
  end if;
  if p_client_token is null or jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload -> 'consent' is distinct from 'true'::jsonb
    or jsonb_typeof(p_payload -> 'attending') is distinct from 'boolean'
    or jsonb_typeof(p_payload -> 'guests') is distinct from 'number'
    or jsonb_typeof(p_payload -> 'name') is distinct from 'string'
    or jsonb_typeof(p_payload -> 'phone') is distinct from 'string'
    or jsonb_typeof(p_payload -> 'message') is distinct from 'string'
    or coalesce(p_payload ->> 'side', '') not in ('groom', 'bride')
    or coalesce(p_payload ->> 'meal', '') not in ('yes', 'no', 'undecided')
    or coalesce(p_payload ->> 'shuttle', '') not in ('none', 'daejeon', 'gyeongju')
    or char_length(response_name) not between 1 and 80
    or char_length(response_phone) > 30 or response_phone !~ '^[0-9+() -]*$'
    or (response_phone <> '' and char_length(regexp_replace(response_phone, '[^0-9]', '', 'g')) not between 7 and 15)
    or char_length(response_message) > 1000
    or (p_payload ->> 'guests') !~ '^(0|[1-9]|10)$'
  then raise exception 'Invalid attendance response' using errcode = '22023'; end if;
  response_guests := (p_payload ->> 'guests')::integer;
  response_attending := (p_payload ->> 'attending')::boolean;
  if (response_attending and response_guests not between 1 and 10) or (not response_attending and response_guests <> 0) then
    raise exception 'Invalid guest count' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(7422376955);
  if not exists (select 1 from public.wedding_rsvps where client_token = p_client_token and side = p_payload ->> 'side')
    and (select count(*) from public.wedding_rsvps) >= 5000 then
    raise exception 'Attendance capacity reached' using errcode = 'P0001';
  end if;
  insert into public.wedding_rsvps (client_token, side, attending, name, phone, guests, meal, shuttle, message)
  values (p_client_token, p_payload ->> 'side', response_attending, response_name, response_phone, response_guests,
    case when response_attending then p_payload ->> 'meal' else 'no' end,
    case when response_attending then p_payload ->> 'shuttle' else 'none' end, response_message)
  on conflict (client_token, side) do update set attending = excluded.attending, name = excluded.name,
    phone = excluded.phone, guests = excluded.guests, meal = excluded.meal, shuttle = excluded.shuttle,
    message = excluded.message, consented_at = now(), updated_at = now()
  returning * into entry;
  return jsonb_build_object('id', entry.id, 'created_at', entry.created_at);
end;
$$;
revoke all on function public.submit_wedding_rsvp(jsonb, uuid) from public;
grant execute on function public.submit_wedding_rsvp(jsonb, uuid) to anon, authenticated;

-- A reservation issues one unpredictable, short-lived path. Anonymous visitors
-- cannot enumerate reservations or select, replace or delete uploaded photos.
create or replace function public.reserve_wedding_guest_photo(
  p_client_token uuid, p_guest_name text, p_file_name text, p_content_type text, p_byte_size integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  entry public.wedding_guest_photos;
  file_id uuid := gen_random_uuid();
  extension text;
begin
  if not (public.get_wedding_guest_capabilities() ->> 'snap_open')::boolean then
    raise exception 'Guest photo uploads are not open' using errcode = 'P0001';
  end if;
  if p_client_token is null or p_guest_name is null or char_length(btrim(p_guest_name)) > 80
    or p_file_name is null or char_length(btrim(p_file_name)) not between 1 and 120 or p_file_name ~ '[[:cntrl:]]'
    or p_content_type is null or p_content_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
    or p_byte_size is null or p_byte_size not between 1 and 2097152 then
    raise exception 'Invalid guest photo' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(7422376956);
  delete from public.wedding_guest_photos p where p.expires_at <= now()
    and not exists (select 1 from storage.objects o where o.bucket_id = 'wedding-guest-photos' and o.name = p.storage_path);
  select * into entry from public.wedding_guest_photos p
    where p.client_token = p_client_token and p.file_name = btrim(p_file_name)
      and p.content_type = p_content_type and p.byte_size = p_byte_size and p.expires_at > now()
      and not exists (select 1 from storage.objects o where o.bucket_id = 'wedding-guest-photos' and o.name = p.storage_path)
    order by p.created_at desc limit 1;
  if found then
    return jsonb_build_object('id', entry.id, 'storage_path', entry.storage_path, 'created_at', entry.created_at);
  end if;
  if (select count(*) from public.wedding_guest_photos where client_token = p_client_token and created_at > now() - interval '1 hour') >= 5
    or (select count(*) from public.wedding_guest_photos) >= 500 then
    raise exception 'Guest photo capacity reached' using errcode = 'P0001';
  end if;
  extension := case p_content_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/avif' then 'avif' else 'webp' end;
  insert into public.wedding_guest_photos(id, client_token, guest_name, file_name, storage_path, content_type, byte_size)
  values (file_id, p_client_token, btrim(p_guest_name), btrim(p_file_name), 'main/' || file_id::text || '.' || extension, p_content_type, p_byte_size)
  returning * into entry;
  return jsonb_build_object('id', entry.id, 'storage_path', entry.storage_path, 'created_at', entry.created_at);
end;
$$;
revoke all on function public.reserve_wedding_guest_photo(uuid, text, text, text, integer) from public;
grant execute on function public.reserve_wedding_guest_photo(uuid, text, text, text, integer) to anon, authenticated;

create or replace function public.wedding_guest_photo_path_allowed(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (public.get_wedding_guest_capabilities() ->> 'snap_open')::boolean and exists (
    select 1 from public.wedding_guest_photos where storage_path = p_path and expires_at > now()
  );
$$;
revoke all on function public.wedding_guest_photo_path_allowed(text) from public;
grant execute on function public.wedding_guest_photo_path_allowed(text) to anon, authenticated;

create or replace function public.list_wedding_guest_photos()
returns table(id uuid, guest_name text, file_name text, storage_path text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_wedding_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  return query select p.id, p.guest_name, p.file_name, p.storage_path, p.created_at
    from public.wedding_guest_photos p join storage.objects o
      on o.bucket_id = 'wedding-guest-photos' and o.name = p.storage_path
    order by p.created_at desc limit 500;
end;
$$;
revoke all on function public.list_wedding_guest_photos() from public, anon;
grant execute on function public.list_wedding_guest_photos() to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('wedding-guest-photos', 'wedding-guest-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict(id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Guests upload reserved wedding day photos" on storage.objects;
create policy "Guests upload reserved wedding day photos" on storage.objects for insert to anon, authenticated
with check (bucket_id = 'wedding-guest-photos' and public.wedding_guest_photo_path_allowed(name));
drop policy if exists "Administrators read wedding day photos" on storage.objects;
create policy "Administrators read wedding day photos" on storage.objects for select to authenticated
using (bucket_id = 'wedding-guest-photos' and (select public.is_wedding_admin()));
drop policy if exists "Administrators delete wedding day photos" on storage.objects;
create policy "Administrators delete wedding day photos" on storage.objects for delete to authenticated
using (bucket_id = 'wedding-guest-photos' and (select public.is_wedding_admin()));

commit;
