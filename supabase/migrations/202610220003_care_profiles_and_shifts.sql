-- CuidaGest: fichas ampliadas y turnos semanales.
-- Ejecutar SOLO en el proyecto Supabase nuevo de CuidaGest, después de las migraciones 001 y 002.
-- No modifica ningún otro proyecto de Supabase.
begin;

-- Ficha de cuidadoras. Evitamos almacenar el número completo del NIE: guardar la fecha de caducidad
-- suele ser suficiente para los avisos previstos; revisar con la empresa si necesita más datos.
alter table public.caregivers
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists second_last_name text,
  add column if not exists birth_date date,
  add column if not exists nationality text,
  add column if not exists identity_document_type text not null default 'NIE',
  add column if not exists nie_expiry_date date,
  add column if not exists home_address text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists postal_code text,
  add column if not exists languages text[] not null default array[]::text[],
  add column if not exists preferred_support_types text[] not null default array[]::text[],
  add column if not exists tags text[] not null default array[]::text[],
  add column if not exists internal_notes text;

alter table public.caregivers
  drop constraint if exists caregivers_identity_document_type_check;
alter table public.caregivers
  add constraint caregivers_identity_document_type_check
  check (identity_document_type in ('NIE', 'DNI', 'Pasaporte', 'Otro'));

-- Nuevos estados para que el proceso de selección sea explícito.
update public.caregivers
set status = case status
  when 'pending_review' then 'under_review'
  when 'rejected' then 'not_suitable'
  else status
end
where status in ('pending_review', 'rejected');

alter table public.caregivers
  drop constraint if exists caregivers_status_check;
alter table public.caregivers
  add constraint caregivers_status_check
  check (status in ('new_candidate', 'under_review', 'interview_scheduled', 'approved', 'not_suitable', 'inactive'));
alter table public.caregivers
  alter column status set default 'new_candidate';

-- Ficha de la persona usuaria del servicio.
alter table public.clients
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists second_last_name text,
  add column if not exists postal_code text,
  add column if not exists province text,
  add column if not exists access_instructions text,
  add column if not exists preferred_schedule text,
  add column if not exists contact_notes text;

-- Un registro por día semanal. Si una cuidadora trabaja lunes y miércoles con
-- una persona, la aplicación guarda dos filas enlazadas a caregiver/client.
create table if not exists public.care_shifts (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregivers(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: lunes=1, domingo=7
  start_time time not null,
  end_time time not null,
  service_type text not null default 'Atención domiciliaria'
    check (length(trim(service_type)) between 1 and 120),
  valid_from date not null default current_date,
  valid_until date,
  status text not null default 'active' check (status in ('active', 'paused')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_shifts_valid_hours check (end_time > start_time),
  constraint care_shifts_valid_dates check (valid_until is null or valid_until >= valid_from)
);

create index if not exists care_shifts_caregiver_weekday_idx
  on public.care_shifts(caregiver_id, weekday, start_time)
  where status = 'active';
create index if not exists care_shifts_client_weekday_idx
  on public.care_shifts(client_id, weekday, start_time)
  where status = 'active';
create index if not exists caregivers_nie_expiry_idx
  on public.caregivers(nie_expiry_date)
  where nie_expiry_date is not null and status <> 'inactive';

drop trigger if exists care_shifts_set_updated_at on public.care_shifts;
create trigger care_shifts_set_updated_at before update on public.care_shifts
  for each row execute function public.set_updated_at();

drop trigger if exists care_shifts_audit on public.care_shifts;
create trigger care_shifts_audit after insert or update or delete on public.care_shifts
  for each row execute function public.audit_row_change();

-- Evitar solapamientos recurrentes al asignar una persona y una cuidadora.
-- El candado transaccional reduce carreras entre altas simultáneas del mismo recurso.
create or replace function public.prevent_care_shift_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(new.caregiver_id::text),
    new.weekday
  );

  if exists (
    select 1 from public.care_shifts s
    where s.id <> new.id
      and s.status = 'active'
      and s.weekday = new.weekday
      and s.caregiver_id = new.caregiver_id
      and new.start_time < s.end_time
      and new.end_time > s.start_time
      and (s.valid_until is null or new.valid_from <= s.valid_until)
      and (new.valid_until is null or s.valid_from <= new.valid_until)
  ) then
    raise exception 'La cuidadora ya tiene un turno que se solapa en ese día y horario.'
      using errcode = '23P01';
  end if;

  if exists (
    select 1 from public.care_shifts s
    where s.id <> new.id
      and s.status = 'active'
      and s.weekday = new.weekday
      and s.client_id = new.client_id
      and new.start_time < s.end_time
      and new.end_time > s.start_time
      and (s.valid_until is null or new.valid_from <= s.valid_until)
      and (new.valid_until is null or s.valid_from <= new.valid_until)
  ) then
    raise exception 'La persona atendida ya tiene un turno que se solapa en ese día y horario.'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists care_shifts_prevent_overlap on public.care_shifts;
create trigger care_shifts_prevent_overlap
  before insert or update on public.care_shifts
  for each row execute function public.prevent_care_shift_overlap();

-- Acceso solo al administrador autenticado y activo. No permitir acceso anónimo.
alter table public.care_shifts enable row level security;
revoke all on table public.care_shifts from anon, authenticated;
grant select, insert, update on table public.care_shifts to authenticated;

drop policy if exists care_shifts_admin_all on public.care_shifts;
create policy care_shifts_admin_all on public.care_shifts
  for all to authenticated
  using ((select public.current_staff_role()) = 'admin')
  with check ((select public.current_staff_role()) = 'admin');

-- La aplicación evita borrar turnos; se deben pausar para conservar su historial.
revoke delete on table public.care_shifts from authenticated;

commit;
