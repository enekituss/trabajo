-- CuidaGest: conexión segura con Google Calendar.
-- Ejecutar solo en el proyecto Supabase nuevo de CuidaGest y después de 001, 002 y 003.
-- Los tokens de Google se almacenan cifrados y solo son accesibles desde Edge Functions.

begin;

create table if not exists public.google_calendar_connections (
  user_id uuid primary key references auth.users(id) on delete restrict,
  connected_google_email text,
  calendar_id text not null default 'primary',
  encrypted_refresh_token text not null,
  granted_scopes text[] not null default array[]::text[],
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_sync_error text
);

create table if not exists public.google_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists google_oauth_states_expiry_idx
  on public.google_oauth_states(expires_at);

create table if not exists public.google_calendar_alerts (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregivers(id) on delete restrict,
  alert_type text not null check (alert_type in ('nie_90', 'nie_30', 'nie_7', 'nie_overdue')),
  alert_date date not null,
  google_event_id text,
  sync_status text not null default 'not_synced'
    check (sync_status in ('not_synced', 'synced', 'error', 'skipped')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (caregiver_id, alert_type)
);

alter table public.care_shifts
  add column if not exists google_event_id text,
  add column if not exists calendar_sync_status text not null default 'not_synced',
  add column if not exists calendar_sync_error text;

alter table public.care_shifts
  drop constraint if exists care_shifts_calendar_sync_status_check;
alter table public.care_shifts
  add constraint care_shifts_calendar_sync_status_check
  check (calendar_sync_status in ('not_synced', 'synced', 'error'));

create index if not exists google_calendar_alerts_date_idx
  on public.google_calendar_alerts(alert_date, sync_status);

drop trigger if exists google_calendar_connections_updated_at on public.google_calendar_connections;
create trigger google_calendar_connections_updated_at before update on public.google_calendar_connections
  for each row execute function public.set_updated_at();

drop trigger if exists google_calendar_alerts_updated_at on public.google_calendar_alerts;
create trigger google_calendar_alerts_updated_at before update on public.google_calendar_alerts
  for each row execute function public.set_updated_at();

alter table public.google_calendar_connections enable row level security;
alter table public.google_oauth_states enable row level security;
alter table public.google_calendar_alerts enable row level security;

-- OAuth state, tokens and alert bookkeeping are server-only.
revoke all on table public.google_calendar_connections, public.google_oauth_states,
  public.google_calendar_alerts from anon, authenticated;


-- Crear una cita y su asignación en una sola transacción para no dejar citas a medias.
create or replace function public.create_care_service(
  p_client_id uuid,
  p_caregiver_id uuid,
  p_service_type text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_internal_notes text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_service_id uuid;
  v_uid uuid;
begin
  v_uid := (select auth.uid());
  if (select public.current_staff_role()) is distinct from 'admin' then
    raise exception 'Acceso no autorizado.' using errcode = '42501';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'El fin debe ser posterior al inicio.' using errcode = '22007';
  end if;
  if length(trim(coalesce(p_service_type, ''))) = 0 or length(trim(p_service_type)) > 120 then
    raise exception 'El tipo de servicio no es válido.' using errcode = '22023';
  end if;
  if not exists(select 1 from public.clients c where c.id = p_client_id and c.status = 'active') then
    raise exception 'La persona atendida no está activa.' using errcode = '23503';
  end if;
  if not exists(select 1 from public.caregivers c where c.id = p_caregiver_id and c.status = 'approved') then
    raise exception 'La cuidadora no está aprobada.' using errcode = '23503';
  end if;

  insert into public.services(client_id, service_type, starts_at, ends_at, status, internal_notes, created_by)
  values (p_client_id, trim(p_service_type), p_starts_at, p_ends_at, 'scheduled', nullif(trim(p_internal_notes), ''), v_uid)
  returning id into v_service_id;

  insert into public.service_assignments(service_id, caregiver_id, assigned_by)
  values (v_service_id, p_caregiver_id, v_uid);

  return v_service_id;
end;
$$;

revoke all on function public.create_care_service(uuid, uuid, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.create_care_service(uuid, uuid, text, timestamptz, timestamptz, text) to authenticated;


commit;

-- After running this migration, deploy the three Google Calendar Edge Functions.
-- Never place Google OAuth client secrets, refresh tokens or encryption keys in GitHub.
