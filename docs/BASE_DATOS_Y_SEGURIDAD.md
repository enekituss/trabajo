# Base de datos y seguridad de CuidaGest

## Decisión técnica propuesta

Usar **Supabase con PostgreSQL** como base de datos gestionada, Supabase Auth para las cuentas del personal y Row Level Security (RLS) para que los permisos se apliquen dentro de la propia base de datos. El código de la web irá en GitHub; los registros de personas y servicios **no** se guardarán en el repositorio ni en el navegador.

Como la empresa está en España, al crear el proyecto habrá que elegir una región de la UE. La región concreta debe seleccionarse conscientemente en el panel de Supabase; Frankfurt (`eu-central-1`) es una opción regional disponible. Elegir región no garantiza por sí solo el cumplimiento del RGPD.

## Esquema inicial

La migración `supabase/migrations/202610220001_initial_schema.sql` crea:

- `staff_profiles`: cuentas internas y roles (`admin`, `recruitment`, `coordination`).
- `caregivers`: perfil profesional, datos de contacto necesarios y estado de selección.
- `caregiver_availability`: disponibilidad semanal con rango de fechas opcional.
- `clients`: ficha de la persona usuaria y datos operativos mínimos.
- `services`: tipo, inicio, fin, estado y referencias de sincronización con Google Calendar.
- `service_assignments`: asignaciones actuales e historial de cambios de cuidador.
- `audit_events`: quién cambió qué registro, cuándo y qué campos cambiaron; no copia los valores antiguos/nuevos de datos personales.

Se usan claves foráneas, restricciones e índices básicos. La aplicación no tiene permiso de borrado normal: los registros se archivan o cambian de estado para evitar eliminaciones accidentales. Los cambios de datos importantes quedan registrados.

## Estado actual: esquema preparado, base real aún no creada

Subir la migración a GitHub **no crea automáticamente** una base de datos en la nube. Para activarla:

1. Una persona autorizada de la empresa debe crear el proyecto de Supabase bajo una cuenta corporativa, activar la autenticación y seleccionar una región de la UE.
2. Revisar la migración y ejecutarla en el proyecto de desarrollo desde el SQL Editor o mediante Supabase CLI.
3. Crear una cuenta de personal en Supabase Auth.
4. Tras crear esa cuenta, obtener su UUID en el panel de autenticación y dar de alta el primer perfil administrador desde el SQL Editor con una consulta similar a la siguiente, sustituyendo los valores por los reales:
   ```sql
   insert into public.staff_profiles (id, display_name, role)
   values ('UUID-DE-LA-CUENTA-AUTORIZADA', 'Administrador inicial', 'admin');
   ```
5. Probar con cuentas de cada rol que solo puedan leer y cambiar los datos permitidos. Probar también que una persona sin iniciar sesión no puede acceder a ninguna ficha.
6. Crear la conexión de la aplicación usando únicamente la clave pública/publishable en el navegador y manteniendo cualquier clave secreta exclusivamente en el servidor. Nunca subir contraseñas, claves de servicio o tokens a GitHub.

**No introduzcas datos reales hasta haber desplegado y probado los permisos y la recuperación de copias.** El esquema es una primera base técnica y aún requiere revisión, pruebas de políticas y despliegue antes de uso empresarial.

## Copias de seguridad y recuperación

Una base de datos persistente no significa que los datos sean imposibles de perder. Antes de producción habrá que:

- Confirmar el plan contratado y qué copias automáticas incluye.
- Programar exportaciones cifradas fuera de la base principal y limitar quién puede recuperarlas.
- Probar periódicamente una restauración en un entorno separado.
- Definir quién responde ante borrados accidentales, pérdida de acceso o una caída del servicio.
- Mantener un entorno de pruebas separado del de producción y aplicar cambios mediante migraciones versionadas.

La documentación actual de Supabase indica que los proyectos Pro, Team y Enterprise reciben copias diarias automáticas; para proyectos gratuitos recomienda exportaciones regulares propias. Para una herramienta de la que dependa el trabajo de una empresa, no debemos dar por suficiente una cuenta gratuita sin un plan de recuperación probado.

## Privacidad y RGPD

Las fichas pueden incluir datos personales y, si se anotan necesidades derivadas de la salud, categorías especiales de datos. Antes de usarlos, la empresa deberá determinar la base jurídica, informar a las personas, limitar los campos al mínimo necesario, definir plazos de conservación y validar las medidas de seguridad con la persona responsable de protección de datos/asesoría de la empresa.

No añadiremos todavía una zona pública de documentos, historiales médicos, DNI ni otros datos de alta sensibilidad. Si finalmente hacen falta documentos, deberán utilizar almacenamiento privado con permisos específicos; no GitHub ni enlaces públicos.

## Referencias técnicas

- Regiones: https://supabase.com/docs/guides/platform/regions
- Copias de seguridad: https://supabase.com/docs/guides/platform/backups
- Seguridad y RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Lista de comprobación de producción: https://supabase.com/docs/guides/deployment/going-into-prod
- AEPD, datos de salud: https://www.aepd.es/areas-de-actuacion/salud/tus-derechos-en-relacion-con-tus-datos-de-salud
