-- CuidaGest: creación de citas puntuales y prevención de solapamientos.
-- Ejecutar solo en el proyecto de CuidaGest, después de las migraciones 001, 002 y 003.
-- No requiere Google Calendar: registra citas en la base de datos aunque el calendario no esté conectado.

begin;

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
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(new.client_id::text),
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
    raise exception 'La cuidadora ya tiene un turno recurrente que se solapa.'
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
    raise exception 'La persona atendida ya tiene un turno recurrente que se solapa.'
      using errcode = '23P01';
  end if;

  if exists (
    select 1
    from public.services s
    join public.service_assignments a on a.service_id = s.id
    where s.status <> 'cancelled'
      and a.ended_at is null
      and a.caregiver_id = new.caregiver_id
      and extract(isodow from (s.starts_at at time zone 'Europe/Madrid'))::smallint = new.weekday
      and (s.starts_at at time zone 'Europe/Madrid')::date >= new.valid_from
      and (new.valid_until is null or (s.starts_at at time zone 'Europe/Madrid')::date <= new.valid_until)
      and (s.starts_at at time zone 'Europe/Madrid')::time < new.end_time
      and (s.ends_at at time zone 'Europe/Madrid')::time > new.start_time
  ) then
    raise exception 'La cuidadora ya tiene una cita puntual que se solapa con este turno.'
      using errcode = '23P01';
  end if;

  if exists (
    select 1
    from public.services s
    where s.status <> 'cancelled'
      and s.client_id = new.client_id
      and extract(isodow from (s.starts_at at time zone 'Europe/Madrid'))::smallint = new.weekday
      and (s.starts_at at time zone 'Europe/Madrid')::date >= new.valid_from
      and (new.valid_until is null or (s.starts_at at time zone 'Europe/Madrid')::date <= new.valid_until)
      and (s.starts_at at time zone 'Europe/Madrid')::time < new.end_time
      and (s.ends_at at time zone 'Europe/Madrid')::time > new.start_time
  ) then
    raise exception 'La persona atendida ya tiene una cita puntual que se solapa con este turno.'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

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
  v_local_start timestamp without time zone;
  v_local_end timestamp without time zone;
  v_service_date date;
  v_weekday smallint;
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

  v_local_start := p_starts_at at time zone 'Europe/Madrid';
  v_local_end := p_ends_at at time zone 'Europe/Madrid';
  if v_local_start::date <> v_local_end::date then
    raise exception 'La cita debe empezar y terminar el mismo día.' using errcode = '22007';
  end if;
  v_service_date := v_local_start::date;
  v_weekday := extract(isodow from v_local_start)::smallint;

  if not exists(select 1 from public.clients c where c.id = p_client_id and c.status = 'active') then
    raise exception 'La persona atendida no está activa.' using errcode = '23503';
  end if;
  if not exists(select 1 from public.caregivers c where c.id = p_caregiver_id and c.status = 'approved') then
    raise exception 'La cuidadora no está aprobada.' using errcode = '23503';
  end if;

  -- Check against other punctual appointments assigned to this caregiver or client.
  if exists (
    select 1
    from public.services s
    join public.service_assignments a on a.service_id = s.id
    where a.caregiver_id = p_caregiver_id
      and a.ended_at is null
      and s.status <> 'cancelled'
      and p_starts_at < s.ends_at
      and p_ends_at > s.starts_at
  ) then
    raise exception 'La cuidadora ya tiene una cita en ese horario.' using errcode = '23P01';
  end if;
  if exists (
    select 1
    from public.services s
    where s.client_id = p_client_id
      and s.status <> 'cancelled'
      and p_starts_at < s.ends_at
      and p_ends_at > s.starts_at
  ) then
    raise exception 'La persona atendida ya tiene una cita en ese horario.' using errcode = '23P01';
  end if;

  -- Check against the caregiver's existing weekly recurring shift.
  if exists (
    select 1
    from public.care_shifts cs
    where cs.status = 'active'
      and cs.caregiver_id = p_caregiver_id
      and cs.weekday = v_weekday
      and cs.valid_from <= v_service_date
      and (cs.valid_until is null or cs.valid_until >= v_service_date)
      and v_local_start::time < cs.end_time
      and v_local_end::time > cs.start_time
  ) then
    raise exception 'La cuidadora ya tiene un turno recurrente en esa franja horaria.' using errcode = '23P01';
  end if;
  if exists (
    select 1
    from public.care_shifts cs
    where cs.status = 'active'
      and cs.client_id = p_client_id
      and cs.weekday = v_weekday
      and cs.valid_from <= v_service_date
      and (cs.valid_until is null or cs.valid_until >= v_service_date)
      and v_local_start::time < cs.end_time
      and v_local_end::time > cs.start_time
  ) then
    raise exception 'La persona atendida ya tiene un turno recurrente en esa franja horaria.' using errcode = '23P01';
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
