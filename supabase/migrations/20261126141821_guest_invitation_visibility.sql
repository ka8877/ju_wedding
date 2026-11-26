-- Keep the public switch separate from both the draft and the published copy.
begin;
alter table public.wedding_content add column if not exists guest_access_open boolean;
update public.wedding_content set guest_access_open = (published is not null) where guest_access_open is null;
alter table public.wedding_content alter column guest_access_open set default false,
  alter column guest_access_open set not null;

create or replace function public.get_published_wedding()
returns table (data jsonb, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.wedding_content c where c.id = 'main' and not c.guest_access_open) then
    raise sqlstate 'PT423' using message = 'invitation_paused';
  end if;
  return query select c.published, c.updated_at from public.wedding_content c
    where c.id = 'main' and c.guest_access_open and c.published is not null;
end;
$$;
revoke all on function public.get_published_wedding() from public;
grant execute on function public.get_published_wedding() to anon, authenticated;

create or replace function public.get_wedding_guest_capabilities()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  content jsonb;
  date_text text;
  opens date := date '2027-02-20';
  rsvp_enabled boolean := false;
  snap_enabled boolean := false;
begin
  select published into content from public.wedding_content where id = 'main' and guest_access_open;
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
    'snap_open_date', case when content is not null then to_char(opens, 'YYYY-MM-DD') end
  );
end;
$$;
revoke all on function public.get_wedding_guest_capabilities() from public;
grant execute on function public.get_wedding_guest_capabilities() to anon, authenticated;

commit;
