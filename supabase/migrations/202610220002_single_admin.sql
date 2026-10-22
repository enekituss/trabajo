-- CuidaGest: simplificación a un único rol administrador.
-- Aplicar DESPUÉS de 202610220001_initial_schema.sql.
-- Es seguro ejecutarlo si el esquema inicial ya está instalado.
-- Este cambio NO modifica otros proyectos de Supabase: solo afecta al proyecto donde se ejecute.

begin;

-- Mantener el campo para que la función de permisos existente siga funcionando,
-- pero aceptar exclusivamente cuentas administradoras.
alter table public.staff_profiles
  drop constraint if exists staff_profiles_role_check;

alter table public.staff_profiles
  add constraint staff_profiles_role_check check (role = 'admin');

-- Elimina las políticas de varios roles de la versión inicial.
drop policy if exists staff_profiles_read_self_or_admin on public.staff_profiles;
drop policy if exists staff_profiles_insert_admin on public.staff_profiles;
drop policy if exists staff_profiles_update_admin on public.staff_profiles;

drop policy if exists caregivers_read_staff on public.caregivers;
drop policy if exists caregivers_insert_recruitment_admin on public.caregivers;
drop policy if exists caregivers_update_recruitment_admin on public.caregivers;

drop policy if exists availability_read_staff on public.caregiver_availability;
drop policy if exists availability_insert_staff on public.caregiver_availability;
drop policy if exists availability_update_staff on public.caregiver_availability;

drop policy if exists clients_read_coordination_admin on public.clients;
drop policy if exists clients_insert_coordination_admin on public.clients;
drop policy if exists clients_update_coordination_admin on public.clients;

drop policy if exists services_read_coordination_admin on public.services;
drop policy if exists services_insert_coordination_admin on public.services;
drop policy if exists services_update_coordination_admin on public.services;

drop policy if exists assignments_read_coordination_admin on public.service_assignments;
drop policy if exists assignments_insert_coordination_admin on public.service_assignments;
drop policy if exists assignments_update_coordination_admin on public.service_assignments;

drop policy if exists audit_events_read_admin_only on public.audit_events;

-- La aplicación solo podrá leer el perfil del usuario conectado.
-- La creación de la primera cuenta administradora se hará manualmente desde SQL Editor.
-- No se concede a la aplicación permiso para crear otros perfiles internos.
revoke all on table public.staff_profiles from anon, authenticated;
grant select on table public.staff_profiles to authenticated;

create policy staff_profiles_read_self on public.staff_profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- Una cuenta de personal activa con rol admin puede gestionar todos los registros.
create policy caregivers_admin_all on public.caregivers
  for all to authenticated
  using ((select public.current_staff_role()) = 'admin')
  with check ((select public.current_staff_role()) = 'admin');

create policy availability_admin_all on public.caregiver_availability
  for all to authenticated
  using ((select public.current_staff_role()) = 'admin')
  with check ((select public.current_staff_role()) = 'admin');

create policy clients_admin_all on public.clients
  for all to authenticated
  using ((select public.current_staff_role()) = 'admin')
  with check ((select public.current_staff_role()) = 'admin');

create policy services_admin_all on public.services
  for all to authenticated
  using ((select public.current_staff_role()) = 'admin')
  with check ((select public.current_staff_role()) = 'admin');

create policy assignments_admin_all on public.service_assignments
  for all to authenticated
  using ((select public.current_staff_role()) = 'admin')
  with check ((select public.current_staff_role()) = 'admin');

create policy audit_events_admin_read on public.audit_events
  for select to authenticated
  using ((select public.current_staff_role()) = 'admin');

-- No conceder DELETE directamente a la aplicación; se deben archivar/cancelar registros.
-- Eliminar privilegios de escritura en auditoría: el registro lo realiza el trigger.
revoke delete on table public.caregivers, public.caregiver_availability,
  public.clients, public.services, public.service_assignments from authenticated;
revoke insert, update, delete on table public.audit_events from anon, authenticated;

commit;

-- Después de aplicar esta migración:
-- 1. Desactivar los registros públicos en Supabase Auth.
-- 2. Crear solo la cuenta de tu madre desde Authentication.
-- 3. Insertar su fila en staff_profiles desde SQL Editor con su UUID real.
-- 4. Probar las políticas antes de usar datos reales.
