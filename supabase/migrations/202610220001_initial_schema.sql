-- CuidaGest: esquema inicial de base de datos.
-- Ejecutar únicamente en un proyecto Supabase nuevo/de desarrollo tras revisar este esquema.
-- No contiene datos reales. Los usuarios internos se crean mediante Supabase Auth.
-- Acceso anónimo prohibido; la aplicación solo operará con personal autenticado y activo.

create table public.staff_profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  role text not null check (role in ('admin', 'recruitment', 'coordination')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.caregivers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) between 1 and 160),
  phone text,
  email text,
  work_area text,
  experience_summary text,
  training_summary text,
  availability_summary text,
  review_notes text,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.caregiver_availability (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregivers(id) on delete restrict,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: lunes=1, domingo=7
  start_time time not null,
  end_time time not null,
  valid_from date,
  valid_until date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caregiver_availability_valid_hours check (end_time > start_time),
  constraint caregiver_availability_valid_dates check (
    valid_from is null or valid_until is null or valid_until >= valid_from
  )
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) between 1 and 160),
  contact_phone text,
  service_address text,
  service_area text,
  support_type text,
  care_requirements text,
  coordination_notes text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'closed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.clients.care_requirements is
  'Potentially sensitive: document only what is necessary for safe service delivery; define a lawful basis and access rules before production.';
comment on column public.clients.coordination_notes is
  'Internal notes may contain personal/sensitive information. Minimise content and restrict access.';

create table public.services (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  service_type text not null check (length(trim(service_type)) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  calendar_provider text check (calendar_provider is null or calendar_provider = 'google'),
  calendar_event_id text,
  calendar_sync_status text not null default 'not_synced'
    check (calendar_sync_status in ('not_synced', 'synced', 'error')),
  calendar_sync_error text,
  internal_notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_valid_time check (ends_at > starts_at)
);

comment on column public.services.internal_notes is
  'Keep notes operational and minimal. Do not use this field as a medical record.';

-- Separate assignments preserve the history when a caregiver is changed.
-- Close an active assignment (ended_at) before inserting its replacement.
create table public.service_assignments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  caregiver_id uuid not null references public.caregivers(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  assigned_by uuid references auth.users(id) on delete set null,
  ended_by uuid references auth.users(id) on delete set null,
  constraint service_assignments_valid_period check (ended_at is null or ended_at >= assigned_at)
);

-- One current caregiver per service. Past assignments stay in the table for traceability.
create unique index service_assignments_one_active_per_service
  on public.service_assignments(service_id)
  where ended_at is null;

-- Audit log: records who changed which record, when, and which fields changed,
-- but deliberately does not copy the old/new contents of personal data.
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_fields text[] not null default array[]::text[],
  occurred_at timestamptz not null default now()
);

create index caregivers_status_name_idx on public.caregivers(status, full_name);
create index caregiver_availability_caregiver_day_idx on public.caregiver_availability(caregiver_id, weekday);
create index clients_status_name_idx on public.clients(status, full_name);
create index services_starts_at_status_idx on public.services(starts_at, status);
create index services_client_starts_at_idx on public.services(client_id, starts_at);
create index service_assignments_caregiver_idx on public.service_assignments(caregiver_id, assigned_at desc);
create index audit_events_entity_idx on public.audit_events(entity_type, entity_id, occurred_at desc);
create index audit_events_actor_idx on public.audit_events(actor_id, occurred_at desc);

create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select sp.role
  from public.staff_profiles as sp
  where sp.id = (select auth.uid())
    and sp.is_active = true
  limit 1;
$$;

revoke all on function public.current_staff_role() from public, anon;
grant execute on function public.current_staff_role() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_entity_id uuid;
  v_old jsonb;
  v_new jsonb;
  v_fields text[];
begin
  v_actor_id := (select auth.uid());

  if tg_op = 'INSERT' then
    v_entity_id := (to_jsonb(new)->>'id')::uuid;
    insert into public.audit_events(actor_id, entity_type, entity_id, action, changed_fields)
    values (v_actor_id, tg_table_name, v_entity_id, 'INSERT', array['*']::text[]);
    return new;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_entity_id := (v_new->>'id')::uuid;

    select coalesce(array_agg(n.key order by n.key), array[]::text[])
      into v_fields
    from jsonb_each(v_new) as n
    left join jsonb_each(v_old) as o on o.key = n.key
    where n.value is distinct from o.value
      and n.key not in ('updated_at');

    if cardinality(v_fields) > 0 then
      insert into public.audit_events(actor_id, entity_type, entity_id, action, changed_fields)
      values (v_actor_id, tg_table_name, v_entity_id, 'UPDATE', v_fields);
    end if;
    return new;
  else
    v_entity_id := (to_jsonb(old)->>'id')::uuid;
    insert into public.audit_events(actor_id, entity_type, entity_id, action, changed_fields)
    values (v_actor_id, tg_table_name, v_entity_id, 'DELETE', array['*']::text[]);
    return old;
  end if;
end;
$$;

revoke all on function public.audit_row_change() from public, anon, authenticated;

create trigger staff_profiles_set_updated_at before update on public.staff_profiles
  for each row execute function public.set_updated_at();
create trigger caregivers_set_updated_at before update on public.caregivers
  for each row execute function public.set_updated_at();
create trigger caregiver_availability_set_updated_at before update on public.caregiver_availability
  for each row execute function public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger services_set_updated_at before update on public.services
  for each row execute function public.set_updated_at();

create trigger staff_profiles_audit after insert or update or delete on public.staff_profiles
  for each row execute function public.audit_row_change();
create trigger caregivers_audit after insert or update or delete on public.caregivers
  for each row execute function public.audit_row_change();
create trigger caregiver_availability_audit after insert or update or delete on public.caregiver_availability
  for each row execute function public.audit_row_change();
create trigger clients_audit after insert or update or delete on public.clients
  for each row execute function public.audit_row_change();
create trigger services_audit after insert or update or delete on public.services
  for each row execute function public.audit_row_change();
create trigger service_assignments_audit after insert or update or delete on public.service_assignments
  for each row execute function public.audit_row_change();

-- No privileges for visitors. RLS policies below apply to authenticated staff.
revoke all on table public.staff_profiles, public.caregivers, public.caregiver_availability,
  public.clients, public.services, public.service_assignments, public.audit_events
  from anon, authenticated;

grant select, insert, update on table public.staff_profiles, public.caregivers,
  public.caregiver_availability, public.clients, public.services, public.service_assignments
  to authenticated;
grant select on table public.audit_events to authenticated;
-- Intentionally no DELETE privilege for the app. Archive/cancel records instead of deleting them.

alter table public.staff_profiles enable row level security;
alter table public.caregivers enable row level security;
alter table public.caregiver_availability enable row level security;
alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.service_assignments enable row level security;
alter table public.audit_events enable row level security;

create policy staff_profiles_read_self_or_admin on public.staff_profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.current_staff_role()) = 'admin');
create policy staff_profiles_insert_admin on public.staff_profiles
  for insert to authenticated
  with check ((select public.current_staff_role()) = 'admin');
create policy staff_profiles_update_admin on public.staff_profiles
  for update to authenticated
  using ((select public.current_staff_role()) = 'admin')
  with check ((select public.current_staff_role()) = 'admin');

create policy caregivers_read_staff on public.caregivers
  for select to authenticated
  using ((select public.current_staff_role()) in ('admin', 'recruitment', 'coordination'));
create policy caregivers_insert_recruitment_admin on public.caregivers
  for insert to authenticated
  with check ((select public.current_staff_role()) in ('admin', 'recruitment'));
create policy caregivers_update_recruitment_admin on public.caregivers
  for update to authenticated
  using ((select public.current_staff_role()) in ('admin', 'recruitment'))
  with check ((select public.current_staff_role()) in ('admin', 'recruitment'));

create policy availability_read_staff on public.caregiver_availability
  for select to authenticated
  using ((select public.current_staff_role()) in ('admin', 'recruitment', 'coordination'));
create policy availability_insert_staff on public.caregiver_availability
  for insert to authenticated
  with check ((select public.current_staff_role()) in ('admin', 'recruitment', 'coordination'));
create policy availability_update_staff on public.caregiver_availability
  for update to authenticated
  using ((select public.current_staff_role()) in ('admin', 'recruitment', 'coordination'))
  with check ((select public.current_staff_role()) in ('admin', 'recruitment', 'coordination'));

create policy clients_read_coordination_admin on public.clients
  for select to authenticated
  using ((select public.current_staff_role()) in ('admin', 'coordination'));
create policy clients_insert_coordination_admin on public.clients
  for insert to authenticated
  with check ((select public.current_staff_role()) in ('admin', 'coordination'));
create policy clients_update_coordination_admin on public.clients
  for update to authenticated
  using ((select public.current_staff_role()) in ('admin', 'coordination'))
  with check ((select public.current_staff_role()) in ('admin', 'coordination'));

create policy services_read_coordination_admin on public.services
  for select to authenticated
  using ((select public.current_staff_role()) in ('admin', 'coordination'));
create policy services_insert_coordination_admin on public.services
  for insert to authenticated
  with check ((select public.current_staff_role()) in ('admin', 'coordination'));
create policy services_update_coordination_admin on public.services
  for update to authenticated
  using ((select public.current_staff_role()) in ('admin', 'coordination'))
  with check ((select public.current_staff_role()) in ('admin', 'coordination'));

create policy assignments_read_coordination_admin on public.service_assignments
  for select to authenticated
  using ((select public.current_staff_role()) in ('admin', 'coordination'));
create policy assignments_insert_coordination_admin on public.service_assignments
  for insert to authenticated
  with check ((select public.current_staff_role()) in ('admin', 'coordination'));
create policy assignments_update_coordination_admin on public.service_assignments
  for update to authenticated
  using ((select public.current_staff_role()) in ('admin', 'coordination'))
  with check ((select public.current_staff_role()) in ('admin', 'coordination'));

create policy audit_events_read_admin_only on public.audit_events
  for select to authenticated
  using ((select public.current_staff_role()) = 'admin');

-- End of initial schema. Before using real data:
-- 1. review/test every RLS policy,
-- 2. create and test backup + restore procedures,
-- 3. set an EU region, authentication, MFA and access procedures,
-- 4. review data-protection obligations and retention with the company.
