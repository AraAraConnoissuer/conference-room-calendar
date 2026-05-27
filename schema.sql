-- CORE Conference Room Reservation Engine
-- Run this file in the Supabase SQL editor after creating your project.

create extension if not exists pgcrypto;

create or replace function public.normalize_student_number(value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]', '', 'g');
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  student_number text unique not null,
  full_name text,
  email text,
  role text not null default 'student' check (role in ('student', 'admin')),
  department text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  student_number text not null,
  full_name text,
  department text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  unique (user_id)
);

create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  student_number text not null,
  full_name text not null,
  department text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  organization text,
  people_involved text,
  purpose text not null,
  notes text,
  account_email text,
  accepted_rules boolean not null default false,
  accepted_data_privacy boolean not null default false,
  accepted_chain_of_command boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  reserved_by_name text,
  status text not null default 'confirmed' check (status in ('confirmed', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_time_order check (start_time < end_time)
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  student_name text,
  organization text,
  reservation_id uuid references public.reservations(id) on delete set null,
  action text not null,
  description text,
  changed_by uuid references public.profiles(id) on delete set null,
  performed_by text,
  performed_by_role text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.reservation_agreements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  accepted_rules boolean not null default false,
  accepted_data_privacy boolean not null default false,
  accepted_chain_of_command boolean not null default false,
  accepted_at timestamptz not null default now()
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  setting_name text unique not null,
  setting_value text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.blocked_times (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Blocked time',
  start_time timestamptz not null,
  end_time timestamptz not null,
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint blocked_times_time_order check (start_time < end_time)
);

alter table public.reservations add column if not exists account_email text;
alter table public.reservations add column if not exists accepted_rules boolean not null default false;
alter table public.reservations add column if not exists accepted_data_privacy boolean not null default false;
alter table public.reservations add column if not exists accepted_chain_of_command boolean not null default false;
alter table public.activity_logs add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table public.activity_logs add column if not exists student_name text;
alter table public.activity_logs add column if not exists organization text;
alter table public.activity_logs add column if not exists description text;
alter table public.activity_logs add column if not exists performed_by text;
alter table public.activity_logs add column if not exists performed_by_role text;

create index if not exists reservations_start_time_idx on public.reservations(start_time);
create index if not exists reservations_end_time_idx on public.reservations(end_time);
create index if not exists reservations_created_by_idx on public.reservations(created_by);
create index if not exists reservations_status_idx on public.reservations(status);
create index if not exists blocked_times_start_time_idx on public.blocked_times(start_time);
create index if not exists blocked_times_end_time_idx on public.blocked_times(end_time);
create index if not exists blocked_times_created_by_idx on public.blocked_times(created_by);
create index if not exists activity_logs_reservation_id_idx on public.activity_logs(reservation_id);
create index if not exists activity_logs_changed_by_idx on public.activity_logs(changed_by);
create index if not exists activity_logs_user_id_idx on public.activity_logs(user_id);
create index if not exists reservation_agreements_user_id_idx on public.reservation_agreements(user_id);
create index if not exists reservation_agreements_reservation_id_idx on public.reservation_agreements(reservation_id);
create index if not exists profiles_student_number_idx on public.profiles(student_number);
create unique index if not exists profiles_normalized_student_number_unique_idx
on public.profiles(public.normalize_student_number(student_number));
create index if not exists admin_requests_status_idx on public.admin_requests(status);
create index if not exists admin_requests_user_id_idx on public.admin_requests(user_id);
create index if not exists admin_requests_reviewed_by_idx on public.admin_requests(reviewed_by);
create index if not exists password_reset_requests_status_idx on public.password_reset_requests(status);
create index if not exists password_reset_requests_student_number_idx on public.password_reset_requests(student_number);
create index if not exists password_reset_requests_reviewed_by_idx on public.password_reset_requests(reviewed_by);
create unique index if not exists password_reset_requests_one_pending_idx
on public.password_reset_requests(public.normalize_student_number(student_number))
where status = 'pending';

insert into public.settings (setting_name, setting_value)
values
  ('max_student_booking_hours', '5'),
  ('max_student_bookings_per_week', '2'),
  ('room_name', 'CSC Conference Room')
on conflict (setting_name) do nothing;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reservations_set_updated_at on public.reservations;
create trigger reservations_set_updated_at
before update on public.reservations
for each row
execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.prevent_reservation_overlap()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  conflict_title text;
begin
  if new.status <> 'confirmed' then
    return new;
  end if;

  select r.title into conflict_title
  from public.reservations r
  where r.status = 'confirmed'
    and r.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and new.start_time < r.end_time
    and new.end_time > r.start_time
  limit 1;

  if conflict_title is not null then
    raise exception 'Schedule Conflict Detected: overlaps reservation "%"', conflict_title
      using errcode = '23P01';
  end if;

  select b.title into conflict_title
  from public.blocked_times b
  where new.start_time < b.end_time
    and new.end_time > b.start_time
  limit 1;

  if conflict_title is not null then
    raise exception 'Schedule Conflict Detected: overlaps blocked time "%"', conflict_title
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_blocked_time_overlap()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  conflict_title text;
begin
  select r.title into conflict_title
  from public.reservations r
  where r.status = 'confirmed'
    and new.start_time < r.end_time
    and new.end_time > r.start_time
  limit 1;

  if conflict_title is not null then
    raise exception 'Schedule Conflict Detected: blocked time overlaps reservation "%"', conflict_title
      using errcode = '23P01';
  end if;

  select b.title into conflict_title
  from public.blocked_times b
  where b.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and new.start_time < b.end_time
    and new.end_time > b.start_time
  limit 1;

  if conflict_title is not null then
    raise exception 'Schedule Conflict Detected: blocked time overlaps "%"', conflict_title
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_prevent_overlap on public.reservations;
create trigger reservations_prevent_overlap
before insert or update on public.reservations
for each row
execute function public.prevent_reservation_overlap();

drop trigger if exists blocked_times_prevent_overlap on public.blocked_times;
create trigger blocked_times_prevent_overlap
before insert or update on public.blocked_times
for each row
execute function public.prevent_blocked_time_overlap();

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

  if not (new.accepted_rules and new.accepted_data_privacy and new.accepted_chain_of_command) then
    raise exception 'CSC Conference Room Rules and Agreement must be accepted before submitting your reservation.' using errcode = '22023';
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

drop trigger if exists reservations_enforce_core_student_booking_rules on public.reservations;
create trigger reservations_enforce_core_student_booking_rules
before insert or update on public.reservations
for each row
execute function public.enforce_core_student_booking_rules();

create or replace function public.log_reservation_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_actor public.profiles;
  v_student_name text;
  v_org text;
  v_start timestamptz;
  v_end timestamptz;
  v_action text;
begin
  select * into v_actor
  from public.profiles
  where id = auth.uid();

  if tg_op = 'INSERT' then
    v_payload := to_jsonb(new);
    v_student_name := new.reserved_by_name;
    v_org := new.organization;
    v_start := new.start_time;
    v_end := new.end_time;
    v_action := 'student_created_reservation';
    insert into public.activity_logs (
      user_id, student_name, organization, reservation_id, action, description,
      changed_by, performed_by, performed_by_role, old_value, new_value
    )
    values (
      new.created_by,
      v_student_name,
      v_org,
      new.id,
      v_action,
      format('%s created a reservation for the CSC Conference Room on %s, from %s to %s.',
        coalesce(v_student_name, 'A student'),
        to_char(v_start, 'FMMonth DD, YYYY'),
        to_char(v_start, 'FMHH12:MI AM'),
        to_char(v_end, 'FMHH12:MI AM')
      ),
      auth.uid(),
      coalesce(v_actor.full_name, 'Unknown user'),
      coalesce(v_actor.role, 'unknown'),
      null,
      v_payload
    );
    return new;
  elsif tg_op = 'UPDATE' then
    v_payload := to_jsonb(new);
    v_student_name := new.reserved_by_name;
    v_org := new.organization;
    v_start := new.start_time;
    v_end := new.end_time;
    v_action := case
      when old.status <> new.status then 'reservation_status_changed'
      when public.is_admin() and old.created_by <> auth.uid() then 'admin_override'
      else 'reservation_edited'
    end;
    insert into public.activity_logs (
      user_id, student_name, organization, reservation_id, action, description,
      changed_by, performed_by, performed_by_role, old_value, new_value
    )
    values (
      new.created_by,
      v_student_name,
      v_org,
      new.id,
      v_action,
      format('%s updated a reservation for the CSC Conference Room on %s, from %s to %s.',
        coalesce(v_student_name, 'A student'),
        to_char(v_start, 'FMMonth DD, YYYY'),
        to_char(v_start, 'FMHH12:MI AM'),
        to_char(v_end, 'FMHH12:MI AM')
      ),
      auth.uid(),
      coalesce(v_actor.full_name, 'Unknown user'),
      coalesce(v_actor.role, 'unknown'),
      to_jsonb(old),
      v_payload
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.activity_logs (
      user_id, student_name, organization, reservation_id, action, description,
      changed_by, performed_by, performed_by_role, old_value, new_value
    )
    values (
      old.created_by,
      old.reserved_by_name,
      old.organization,
      null,
      'reservation_deleted',
      format('%s deleted a reservation for the CSC Conference Room on %s, from %s to %s.',
        coalesce(old.reserved_by_name, 'A student'),
        to_char(old.start_time, 'FMMonth DD, YYYY'),
        to_char(old.start_time, 'FMHH12:MI AM'),
        to_char(old.end_time, 'FMHH12:MI AM')
      ),
      auth.uid(),
      coalesce(v_actor.full_name, 'Unknown user'),
      coalesce(v_actor.role, 'unknown'),
      to_jsonb(old),
      null
    );
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists reservations_log_activity_insert on public.reservations;
create trigger reservations_log_activity_insert
after insert on public.reservations
for each row
execute function public.log_reservation_activity();

drop trigger if exists reservations_log_activity_update on public.reservations;
create trigger reservations_log_activity_update
after update on public.reservations
for each row
execute function public.log_reservation_activity();

drop trigger if exists reservations_log_activity_delete on public.reservations;
create trigger reservations_log_activity_delete
after delete on public.reservations
for each row
execute function public.log_reservation_activity();

revoke execute on function public.log_reservation_activity() from public, anon, authenticated;

create or replace function public.log_reservation_agreement_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations;
  v_actor public.profiles;
begin
  select * into v_reservation
  from public.reservations
  where id = new.reservation_id;

  select * into v_actor
  from public.profiles
  where id = new.user_id;

  insert into public.activity_logs (
    user_id, student_name, organization, reservation_id, action, description,
    changed_by, performed_by, performed_by_role, new_value
  )
  values
    (
      new.user_id,
      v_reservation.reserved_by_name,
      v_reservation.organization,
      new.reservation_id,
      'rules_agreement_accepted',
      coalesce(v_reservation.reserved_by_name, 'A student') || ' accepted the CSC Conference Room Rules and Agreement.',
      new.user_id,
      coalesce(v_actor.full_name, 'Unknown user'),
      coalesce(v_actor.role, 'student'),
      to_jsonb(new)
    ),
    (
      new.user_id,
      v_reservation.reserved_by_name,
      v_reservation.organization,
      new.reservation_id,
      'data_privacy_agreement_accepted',
      coalesce(v_reservation.reserved_by_name, 'A student') || ' accepted the Data Privacy Agreement.',
      new.user_id,
      coalesce(v_actor.full_name, 'Unknown user'),
      coalesce(v_actor.role, 'student'),
      to_jsonb(new)
    ),
    (
      new.user_id,
      v_reservation.reserved_by_name,
      v_reservation.organization,
      new.reservation_id,
      'chain_of_command_agreement_accepted',
      coalesce(v_reservation.reserved_by_name, 'A student') || ' accepted the proper CSC process and chain of command.',
      new.user_id,
      coalesce(v_actor.full_name, 'Unknown user'),
      coalesce(v_actor.role, 'student'),
      to_jsonb(new)
    );

  return new;
end;
$$;

drop trigger if exists reservation_agreements_log_activity on public.reservation_agreements;
create trigger reservation_agreements_log_activity
after insert on public.reservation_agreements
for each row
execute function public.log_reservation_agreement_activity();

revoke execute on function public.log_reservation_agreement_activity() from public, anon, authenticated;

create or replace function public.get_calendar_reservations()
returns table (
  id uuid,
  title text,
  start_time timestamptz,
  end_time timestamptz,
  organization text,
  people_involved text,
  purpose text,
  notes text,
  account_email text,
  created_by uuid,
  reserved_by_name text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    r.id,
    case when r.created_by = auth.uid() or public.is_admin() then r.title else 'Reserved' end as title,
    r.start_time,
    r.end_time,
    case when r.created_by = auth.uid() or public.is_admin() then r.organization else null end as organization,
    case when r.created_by = auth.uid() or public.is_admin() then r.people_involved else null end as people_involved,
    case when r.created_by = auth.uid() or public.is_admin() then r.purpose else null end as purpose,
    null::text as notes,
    case when public.is_admin() then r.account_email else null end as account_email,
    case when r.created_by = auth.uid() or public.is_admin() then r.created_by else null end as created_by,
    case when r.created_by = auth.uid() or public.is_admin() then r.reserved_by_name else null end as reserved_by_name,
    r.status,
    r.created_at,
    r.updated_at
  from public.reservations r
  where r.status in ('confirmed', 'completed')
  order by r.start_time;
$$;

revoke execute on function public.get_calendar_reservations() from public, anon;
grant execute on function public.get_calendar_reservations() to authenticated;

create or replace function public.apply_admin_request_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status <> 'approved' then
    update public.profiles
    set role = 'admin'
    where id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists admin_requests_apply_decision on public.admin_requests;
create trigger admin_requests_apply_decision
after update on public.admin_requests
for each row
when (old.status is distinct from new.status)
execute function public.apply_admin_request_decision();

revoke execute on function public.apply_admin_request_decision() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.reservations enable row level security;
alter table public.activity_logs enable row level security;
alter table public.blocked_times enable row level security;
alter table public.admin_requests enable row level security;
alter table public.password_reset_requests enable row level security;
alter table public.reservation_agreements enable row level security;
alter table public.settings enable row level security;

drop policy if exists "Profiles can read own profile" on public.profiles;
create policy "Profiles can read own profile"
on public.profiles for select
using (id = auth.uid() or public.is_admin());

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles for insert
with check (id = auth.uid() and role = 'student');

drop policy if exists "Users can update own non-admin profile" on public.profiles;
create policy "Users can update own non-admin profile"
on public.profiles for update
using (id = auth.uid() or public.is_admin())
with check (
  public.is_admin()
  or (id = auth.uid() and role = 'student')
);

drop policy if exists "Everyone can read reservations" on public.reservations;
drop policy if exists "Owners and admins read reservation details" on public.reservations;
create policy "Owners and admins read reservation details"
on public.reservations for select
to authenticated
using (created_by = auth.uid() or public.is_admin());

drop policy if exists "Students insert own reservations" on public.reservations;
create policy "Students insert own reservations"
on public.reservations for insert
to authenticated
with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "Owners and admins update reservations" on public.reservations;
create policy "Owners and admins update reservations"
on public.reservations for update
to authenticated
using (created_by = auth.uid() or public.is_admin())
with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "Owners and admins delete reservations" on public.reservations;
drop policy if exists "Admins delete reservations" on public.reservations;
create policy "Admins delete reservations"
on public.reservations for delete
to authenticated
using (public.is_admin());

drop policy if exists "Admins read activity logs" on public.activity_logs;
create policy "Admins read activity logs"
on public.activity_logs for select
to authenticated
using (public.is_admin());

drop policy if exists "Everyone can read blocked times" on public.blocked_times;
create policy "Everyone can read blocked times"
on public.blocked_times for select
to authenticated
using (true);

drop policy if exists "Admins insert blocked times" on public.blocked_times;
create policy "Admins insert blocked times"
on public.blocked_times for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins update blocked times" on public.blocked_times;
create policy "Admins update blocked times"
on public.blocked_times for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins delete blocked times" on public.blocked_times;
create policy "Admins delete blocked times"
on public.blocked_times for delete
to authenticated
using (public.is_admin());

drop policy if exists "Users read own admin request or admins read all" on public.admin_requests;
create policy "Users read own admin request or admins read all"
on public.admin_requests for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users insert own admin request" on public.admin_requests;
create policy "Users insert own admin request"
on public.admin_requests for insert
to authenticated
with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "Admins update admin requests" on public.admin_requests;
create policy "Admins update admin requests"
on public.admin_requests for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Anyone can submit password reset request" on public.password_reset_requests;
create policy "Anyone can submit password reset request"
on public.password_reset_requests for insert
to anon, authenticated
with check (status = 'pending');

drop policy if exists "Admins read password reset requests" on public.password_reset_requests;
create policy "Admins read password reset requests"
on public.password_reset_requests for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins update password reset requests" on public.password_reset_requests;
create policy "Admins update password reset requests"
on public.password_reset_requests for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Users insert own reservation agreements" on public.reservation_agreements;
create policy "Users insert own reservation agreements"
on public.reservation_agreements for insert
to authenticated
with check (
  user_id = auth.uid()
  and accepted_rules
  and accepted_data_privacy
  and accepted_chain_of_command
);

drop policy if exists "Users read own agreements or admins read all" on public.reservation_agreements;
create policy "Users read own agreements or admins read all"
on public.reservation_agreements for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Authenticated users read settings" on public.settings;
create policy "Authenticated users read settings"
on public.settings for select
to authenticated
using (true);

drop policy if exists "Admins update settings" on public.settings;
create policy "Admins update settings"
on public.settings for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Creates confirmed Supabase Auth accounts from student-number signup without
-- sending synthetic confirmation emails.
create or replace function public.create_student_account(
  p_student_number text,
  p_password text,
  p_full_name text,
  p_department text default '',
  p_requested_role text default 'student'
)
returns public.profiles
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_student_number text;
  v_email text;
  v_user_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_profile public.profiles;
begin
  v_student_number := public.normalize_student_number(p_student_number);

  if v_student_number = '' then
    raise exception 'Student number is required.' using errcode = '22023';
  end if;

  if coalesce(length(p_password), 0) < 6 then
    raise exception 'Password must be at least 6 characters.' using errcode = '22023';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Full name is required.' using errcode = '22023';
  end if;

  if p_requested_role not in ('student', 'admin') then
    raise exception 'Invalid account type.' using errcode = '22023';
  end if;

  v_email := v_student_number || '@aup.edu.ph';

  if exists (
    select 1
    from public.profiles
    where public.normalize_student_number(student_number) = v_student_number
  ) or exists (
    select 1
    from auth.users
    where lower(email) = lower(v_email)
  ) then
    raise exception 'This student number already has an account.' using errcode = '23505';
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    email_change_token_current,
    phone_change,
    phone_change_token,
    reauthentication_token,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    is_sso_user,
    is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf')),
    v_now,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object(
      'student_number', v_student_number,
      'full_name', trim(p_full_name),
      'department', coalesce(trim(p_department), ''),
      'requested_role', p_requested_role
    ),
    v_now,
    v_now,
    false,
    false
  );

  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    v_user_id::text,
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    v_now,
    v_now,
    v_now
  );

  insert into public.profiles (id, student_number, email, full_name, department, role)
  values (v_user_id, v_student_number, v_email, trim(p_full_name), coalesce(trim(p_department), ''), 'student')
  on conflict (id) do update
  set student_number = excluded.student_number,
      email = excluded.email,
      full_name = excluded.full_name,
      department = excluded.department;

  if p_requested_role = 'admin' then
    insert into public.admin_requests (user_id, student_number, full_name, department)
    values (v_user_id, v_student_number, trim(p_full_name), coalesce(trim(p_department), ''))
    on conflict (user_id) do nothing;
  end if;

  select * into v_profile
  from public.profiles
  where id = v_user_id;

  return v_profile;
end;
$$;

revoke execute on function public.create_student_account(text, text, text, text, text) from public;
grant execute on function public.create_student_account(text, text, text, text, text) to anon, authenticated;

-- Optional helper trigger for new auth users.
-- Supabase Auth inserts into auth.users; this creates a matching student profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, student_number, email, full_name, department, role)
  values (
    new.id,
    public.normalize_student_number(coalesce(new.raw_user_meta_data->>'student_number', split_part(new.email, '@', 1))),
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'department',
    'student'
  )
  on conflict (id) do nothing;

  if new.raw_user_meta_data->>'requested_role' = 'admin' then
    insert into public.admin_requests (user_id, student_number, full_name, department)
    values (
      new.id,
      public.normalize_student_number(coalesce(new.raw_user_meta_data->>'student_number', split_part(new.email, '@', 1))),
      coalesce(new.raw_user_meta_data->>'full_name', new.email),
      new.raw_user_meta_data->>'department'
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public;

revoke execute on function public.enforce_core_student_booking_rules() from public, anon, authenticated;
revoke execute on function public.is_admin() from public;
revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

-- Starter admin bootstrap:
-- 1. In the app, create the first account with student number AUP-ADMIN-001 and your chosen password.
-- 2. Promote only that first account from the Supabase SQL editor:
-- update public.profiles set role = 'admin' where student_number = 'aupadmin001';
-- After this, future admin accounts should use "Request admin access" and be approved by an existing admin.
