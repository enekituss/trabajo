-- CuidaGest: número de documento de identidad de las cuidadoras.
-- Ejecutar SOLO en el proyecto Supabase de CuidaGest, después de las migraciones anteriores.
-- No borra ni modifica los datos existentes: los registros actuales quedan con este campo vacío hasta que se complete.

begin;

alter table public.caregivers
  add column if not exists identity_document_number text;

commit;
