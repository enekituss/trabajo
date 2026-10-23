# CuidaGest — Gestión de cuidados

Portal privado para organizar cuidadoras, personas atendidas, turnos, citas y avisos de documentación.

## Funciones

- Acceso mediante Supabase Auth y verificación del perfil administrador.
- Fichas de cuidadoras con estados de selección, documentación (DNI/NIE), disponibilidad, etiquetas y fechas de caducidad.
- Registro de personas atendidas y ubicación del servicio.
- Planificación de turnos recurrentes y citas puntuales, con comprobaciones de solapamiento.
- Panel con avisos de documentación y próximos servicios.
- Apertura de indicaciones de ruta en Google Maps.
- Integración con Google Calendar preparada para sincronizar citas, turnos y recordatorios.

## Base de datos

Las migraciones están en `supabase/migrations/` y deben ejecutarse únicamente en el proyecto de Supabase de CuidaGest, siguiendo el orden indicado:

1. [Esquema inicial](supabase/migrations/202610220001_initial_schema.sql)
2. [Administrador único](supabase/migrations/202610220002_single_admin.sql)
3. [Fichas y turnos](supabase/migrations/202610220003_care_profiles_and_shifts.sql)
4. [Citas puntuales](supabase/migrations/202610220004_citas_puntuales.sql)
5. [Google Calendar](supabase/migrations/202610220005_google_calendar.sql)
6. [Documento de cuidadora](supabase/migrations/202610230006_caregiver_document_number.sql)

Si ya están aplicadas las migraciones 001–003, ejecuta la 004 para habilitar las citas puntuales. Deja la 005 para cuando vayamos a activar Google Calendar. La 006 añade el número de DNI/NIE a las cuidadoras y no borra ni modifica los datos existentes.

## Google Calendar

La conexión necesita la configuración de Google Cloud, los secretos de servidor en Supabase y el despliegue de las tres Edge Functions. Sigue la [guía de configuración](docs/GOOGLE_CALENDAR.md). Hasta completar esos pasos, la sincronización no estará operativa.

Las credenciales OAuth, los tokens y la clave de cifrado deben permanecer en los secretos de Supabase y nunca subirse a GitHub.

## Protección de datos

No guardes contraseñas, tokens ni claves privadas en GitHub. Los números de DNI/NIE se almacenan únicamente en la base de datos privada de CuidaGest y no se incluyen en el código del repositorio.
