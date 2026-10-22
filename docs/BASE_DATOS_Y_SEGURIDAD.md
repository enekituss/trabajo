# CuidaGest: base de datos, turnos y privacidad

## Cuenta y acceso

La primera versión tendrá una única cuenta interna: la de la administradora. Usa Supabase Auth con correo y contraseña, desactiva el registro público y permite que solo una cuenta con perfil activo `admin` lea y cambie datos.

## Esquema

1. `staff_profiles`: perfil de la administradora.
2. `caregivers`: nombres, contacto, zona, experiencia, formación, idiomas, estado del proceso, etiquetas y fecha de caducidad del NIE.
3. `caregiver_availability`: disponibilidad semanal.
4. `clients`: persona atendida, contacto necesario y ubicación/dirección de servicio.
5. `services`: servicio con fecha y hora concretas, incluyendo campos para futura sincronización de calendario.
6. `service_assignments`: asignación puntual e historial.
7. `care_shifts`: turnos recurrentes por día semanal con hora, persona y cuidadora asignadas, y fechas de validez.
8. `audit_events`: registro de cambios por registro y campos modificados.

La migración `supabase/migrations/202610220003_care_profiles_and_shifts.sql` añade los campos y la tabla de turnos. Incluye validación para evitar solapamientos recurrentes del mismo cuidador o de la misma persona en la misma franja horaria.

## Cómo aplicar las migraciones

En el proyecto nuevo de Supabase de CuidaGest, ejecuta cada SQL en este orden:

- `202610220001_initial_schema.sql`
- `202610220002_single_admin.sql`
- `202610220003_care_profiles_and_shifts.sql`

Si ya ejecutaste la 001 y la 002, ejecuta solo la 003. No ejecutes estos archivos en ninguno de los proyectos anteriores de Supabase. Comprueba siempre el nombre del proyecto antes de pulsar Run.

La subida de SQL a GitHub no cambia la base de datos por sí misma.

## Campos personales

El sistema está pensado para guardar solo la información necesaria para gestionar el servicio. La migración recoge la fecha de caducidad del documento, pero no almacena el número completo del NIE. Confirmar con la empresa si tiene una necesidad legítima de registrar más datos identificativos y limitar el acceso en consecuencia.

La ubicación de usuarios puede revelar información personal sensible. No introduzcas datos reales hasta que la base de datos esté creada, los permisos hayan sido probados y la empresa haya revisado la base jurídica, la información a las personas y los plazos de conservación con su asesoría o responsable de protección de datos.

## Mapas y avisos

Para la primera versión se emplean URLs oficiales de Google Maps para buscar una dirección o abrir indicaciones. Las Maps URLs no requieren una API key: https://developers.google.com/maps/documentation/urls/get-started?hl=es

La caducidad del NIE **no se notifica con Google Maps**. Se puede mostrar una alerta en el panel (vencido, vence pronto) y, en una fase posterior, enviar recordatorios mediante Google Calendar/correo a través de una integración segura. Para eso habrá que configurar la API de Google Calendar y probar la autorización, evitando guardar tokens secretos en GitHub.

## Copias de seguridad

Antes de producción, comprueba qué copias incluye el plan contratado, programa exportaciones cifradas externas y prueba la restauración en un entorno separado. Los proyectos Pro, Team y Enterprise reciben copias diarias automáticas; el plan gratuito requiere exportaciones propias periódicas según la documentación actual: https://supabase.com/docs/guides/platform/backups
