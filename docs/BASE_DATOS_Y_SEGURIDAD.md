# Base de datos y seguridad de CuidaGest

## Decisión técnica

Usar **Supabase con PostgreSQL** como base de datos gestionada y Supabase Auth para el inicio de sesión. El código va en GitHub; los registros de cuidadores, usuarios y servicios no se guardarán en el repositorio ni en el navegador.

Como la empresa está en España, al crear el proyecto hay que seleccionar una región de la UE. Frankfurt (`eu-central-1`) es una opción. La región por sí sola no garantiza el cumplimiento del RGPD.

## Usuarios y permisos: un solo administrador

La primera versión tendrá **una única cuenta interna: la de tu madre**, que será administradora y podrá gestionar cuidadores, usuarios, disponibilidad, servicios y asignaciones.

- Desactiva el registro público de cuentas en la configuración de autenticación de Supabase.
- Crea la cuenta de tu madre desde el panel de Supabase Auth.
- Solo después de crearla, copia su UUID real y crea su perfil de administración desde SQL Editor.
- No publiques el UUID como secreto, pero tampoco compartas contraseñas ni tokens.
- Una persona autenticada que no tenga un perfil interno activo no podrá leer ni modificar las tablas de la aplicación.

El esquema mantiene el campo `role` para facilitar una futura ampliación, pero la migración de administrador único solo admite `admin`. La aplicación no tiene permiso para crear otros perfiles internos desde el navegador.

## Inicio de sesión y configuración de la web

La pantalla de inicio de sesión usa Supabase Auth con correo y contraseña, no tiene enlace de registro y verifica que la cuenta tenga un perfil administrador activo. La sesión se guarda en `sessionStorage` para que normalmente se solicite iniciar sesión de nuevo al cerrar la pestaña.

Para configurar la conexión, en `supabase-config.js` se copian únicamente la Project URL y la publishable key del proyecto CuidaGest. Nunca se debe introducir una service_role key o secret key en archivos JavaScript publicados. En la configuración de autenticación de Supabase, desactiva las altas públicas («Allow new users to sign up») y añade la URL final de la aplicación entre las URL permitidas. La interfaz actual sigue siendo una demostración, aunque el acceso se conecte: aún se necesita conectar las operaciones de los formularios con la base de datos.

## Esquema de base de datos

La migración inicial `supabase/migrations/202610220001_initial_schema.sql` crea:

- `staff_profiles`: perfil de la cuenta administradora.
- `caregivers`: perfil profesional, contactos necesarios y estado.
- `caregiver_availability`: disponibilidad semanal.
- `clients`: ficha operativa de la persona usuaria.
- `services`: fechas, horario, estado y campos de sincronización con Google Calendar.
- `service_assignments`: asignación actual e historial de cambios.
- `audit_events`: quién cambió un registro, cuándo y qué campos cambiaron; no copia los valores personales antiguos/nuevos.

La segunda migración `supabase/migrations/202610220002_single_admin.sql` deja las políticas de la aplicación con un solo rol, administrador. No ofrece borrado normal desde la app, para reducir el riesgo de eliminaciones accidentales.

## Cómo aplicar las migraciones

**Importante:** subir SQL a GitHub no crea una base de datos ni lo ejecuta automáticamente.

- En un proyecto Supabase nuevo, abre SQL Editor y ejecuta el archivo `202610220001_initial_schema.sql` completo. Comprueba que terminó sin errores; después ejecuta el archivo `202610220002_single_admin.sql`.
- Si ya habías ejecutado el esquema inicial en el proyecto CuidaGest, no lo repitas: ejecuta únicamente `202610220002_single_admin.sql`.
- Antes de pulsar Run, confirma el nombre del proyecto en Supabase. No ejecutes estos archivos en ninguno de tus proyectos anteriores.

Tras aplicar ambas migraciones, crea el primer usuario desde el panel de autenticación. Copia su UUID en la consulta siguiente y cambia el nombre de ejemplo por el nombre que prefieras. Ejecuta la consulta solo en SQL Editor del proyecto CuidaGest:

```sql
insert into public.staff_profiles (id, display_name, role)
values ('UUID-REAL-DE-LA-CUENTA-DE-TU-MADRE', 'Administradora', 'admin');
```

El texto `UUID-REAL-DE-LA-CUENTA-DE-TU-MADRE` es un marcador: debes sustituirlo por el UUID que muestra Supabase Auth. No lo ejecutes tal cual.

## Copias de seguridad y recuperación

Una base de datos persistente no significa que no pueda perderse información. Antes de producción:

- Confirma el plan y las copias automáticas incluidas.
- Programa exportaciones cifradas fuera de la base principal.
- Prueba la restauración regularmente en un entorno separado.
- Limita el acceso a copias y define quién responde ante pérdida de acceso, borrados accidentales o una caída.
- Separa desarrollo y producción.

Para una herramienta de la que depende el trabajo de una empresa, las copias y la recuperación deben probarse, no darse por supuestas.

## Privacidad

Las fichas pueden contener datos personales y podrían incluir información de salud. Antes de usarlas con personas reales, la empresa debe revisar la base jurídica, informar a las personas, reducir los datos a lo imprescindible, definir plazos de conservación y validar las medidas con la persona responsable de protección de datos o asesoría.

No uses este repositorio para guardar datos reales, documentos identificativos, contraseñas, claves privadas ni tokens.

## Referencias técnicas

- Regiones: https://supabase.com/docs/guides/platform/regions
- Copias de seguridad: https://supabase.com/docs/guides/platform/backups
- Seguridad y RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Preparación para producción: https://supabase.com/docs/guides/deployment/going-into-prod
- AEPD, datos de salud: https://www.aepd.es/areas-de-actuacion/salud/tus-derechos-en-relacion-con-tus-datos-de-salud
