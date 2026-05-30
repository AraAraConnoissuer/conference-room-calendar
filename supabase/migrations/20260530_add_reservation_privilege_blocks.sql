alter table public.profiles add column if not exists reservation_blocked boolean not null default false;
alter table public.profiles add column if not exists reservation_blocked_until timestamptz;
alter table public.profiles add column if not exists reservation_block_reason text;
alter table public.profiles add column if not exists reservation_blocked_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists reservation_blocked_at timestamptz;

create table if not exists public.user_restriction_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('blocked', 'unblocked', 'extended')),
  reason text,
  blocked_until timestamptz,
  performed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists user_restriction_logs_user_id_idx on public.user_restriction_logs(user_id);
create index if not exists user_restriction_logs_performed_by_idx on public.user_restriction_logs(performed_by);

create or replace function public.has_active_reservation_block(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((
    select reservation_blocked
      and (reservation_blocked_until is null or reservation_blocked_until > now())
    from public.profiles
    where id = p_user_id
  ), false);
$$;

create or replace function public.protect_profile_reservation_block_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin()
    and (
      old.reservation_blocked is distinct from new.reservation_blocked
      or old.reservation_blocked_until is distinct from new.reservation_blocked_until
      or old.reservation_block_reason is distinct from new.reservation_block_reason
      or old.reservation_blocked_by is distinct from new.reservation_blocked_by
      or old.reservation_blocked_at is distinct from new.reservation_blocked_at
    ) then
    raise exception 'Only CSC Officers/Admins may change reservation blocks.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_reservation_block_fields on public.profiles;
create trigger profiles_protect_reservation_block_fields
before update on public.profiles
for each row
execute function public.protect_profile_reservation_block_fields();

create or replace function public.set_user_reservation_block(
  p_user_id uuid,
  p_blocked boolean,
  p_blocked_until timestamptz default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_target public.profiles;
  v_action text;
  v_description text;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.role is distinct from 'admin' then
    raise exception 'Only CSC Officers/Admins may manage reservation blocks.' using errcode = '42501';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if v_target.id is null then
    raise exception 'Student account not found.' using errcode = '22023';
  end if;
  if v_target.role = 'admin' then
    raise exception 'Admin accounts cannot be blocked.' using errcode = '42501';
  end if;
  if p_blocked and coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required before blocking reservation privileges.' using errcode = '22023';
  end if;
  if p_blocked and p_blocked_until is not null and p_blocked_until <= now() then
    raise exception 'Block expiration must be in the future.' using errcode = '22023';
  end if;

  v_action := case
    when not p_blocked then 'unblocked'
    when public.has_active_reservation_block(p_user_id) then 'extended'
    else 'blocked'
  end;

  update public.profiles
  set reservation_blocked = p_blocked,
      reservation_blocked_until = case when p_blocked then p_blocked_until else null end,
      reservation_block_reason = case when p_blocked then trim(p_reason) else null end,
      reservation_blocked_by = case when p_blocked then auth.uid() else null end,
      reservation_blocked_at = case when p_blocked then now() else null end
  where id = p_user_id;

  insert into public.user_restriction_logs (user_id, action, reason, blocked_until, performed_by)
  values (p_user_id, v_action, nullif(trim(p_reason), ''), p_blocked_until, auth.uid());

  v_description := case
    when not p_blocked then format('%s reservation privileges were restored by %s.', coalesce(v_target.full_name, 'A student'), coalesce(v_actor.full_name, 'an admin'))
    when p_blocked_until is null then format('%s was blocked indefinitely from creating or editing reservations by %s. Reason: %s', coalesce(v_target.full_name, 'A student'), coalesce(v_actor.full_name, 'an admin'), trim(p_reason))
    else format('%s was blocked from creating or editing reservations until %s by %s. Reason: %s', coalesce(v_target.full_name, 'A student'), to_char(p_blocked_until, 'FMMonth DD, YYYY HH12:MI AM'), coalesce(v_actor.full_name, 'an admin'), trim(p_reason))
  end;

  insert into public.activity_logs (
    user_id, student_name, organization, action, description,
    changed_by, performed_by, performed_by_role, new_value
  )
  values (
    p_user_id, v_target.full_name, v_target.department, 'reservation_privileges_' || v_action,
    v_description, auth.uid(), v_actor.full_name, v_actor.role,
    jsonb_build_object('reservation_blocked', p_blocked, 'reservation_blocked_until', p_blocked_until, 'reason', p_reason)
  );
end;
$$;

create or replace function public.enforce_core_student_booking_rules()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_count integer;
begin
  if public.is_admin() then
    return new;
  end if;

  if public.has_active_reservation_block(auth.uid()) then
    raise exception 'Your reservation privileges have been temporarily blocked. Please contact a CSC Officer/Admin.' using errcode = '42501';
  end if;

  if new.created_by is distinct from auth.uid() then
    raise exception 'Unauthorized reservation owner.' using errcode = '42501';
  end if;

  if coalesce(trim(new.reserved_by_name), '') = ''
    or coalesce(trim(new.organization), '') = ''
    or coalesce(trim(new.people_involved), '') = ''
    or coalesce(trim(new.purpose), '') = '' then
    raise exception 'Please complete all required fields before submitting your reservation.' using errcode = '22023';
  end if;

  if new.end_time <= new.start_time then
    raise exception 'End time must be later than start time.' using errcode = '22023';
  end if;

  if new.end_time - new.start_time > interval '5 hours' then
    raise exception 'Student reservations are limited to a maximum of 5 hours.' using errcode = '22023';
  end if;

  if not (new.accepted_rules and new.accepted_data_privacy) then
    raise exception 'CSC Conference Office Terms of Use and Code of Conduct must be accepted before submitting your reservation.' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    v_week_start := date_trunc('week', new.start_time);
    v_week_end := v_week_start + interval '7 days';

    select count(*) into v_count
    from public.reservations r
    where r.created_by = auth.uid()
      and r.status = 'confirmed'
      and r.start_time >= v_week_start
      and r.start_time < v_week_end;

    if v_count >= 2 then
      raise exception 'You have reached the maximum limit of 2 reservations this week.' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

alter table public.user_restriction_logs enable row level security;

drop policy if exists "Admins read user restriction logs" on public.user_restriction_logs;
create policy "Admins read user restriction logs"
on public.user_restriction_logs for select
to authenticated
using (public.is_admin());

revoke execute on function public.has_active_reservation_block(uuid) from public, anon;
grant execute on function public.has_active_reservation_block(uuid) to authenticated;
revoke execute on function public.set_user_reservation_block(uuid, boolean, timestamptz, text) from public, anon;
grant execute on function public.set_user_reservation_block(uuid, boolean, timestamptz, text) to authenticated;
