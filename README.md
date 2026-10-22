# CuidaGest — Portal de gestión de cuidados

Portal interno en desarrollo para gestionar cuidadoras, personas atendidas, turnos semanales, citas y avisos operativos.

## Estado actual

- Pantalla de inicio de sesión con Supabase Auth.
- Formularios de cuidadoras/personas y turnos conectados al esquema de Supabase cuando está configurado.
- Panel con avisos de caducidad calculados desde las fichas y turnos próximos.
- Enlaces para abrir rutas en Google Maps.
- Integración Google Calendar preparada en archivos, pendiente de configurar Google Cloud, las funciones de Supabase y sus secretos antes de activarla.

## Migraciones de datos

Ejecutar únicamente en el proyecto de CuidaGest y en orden:

1. [Esquema inicial](supabase/migrations/202610220001_initial_schema.sql)
2. [Único administrador](supabase/migrations/202610220002_single_admin.sql)
3. [Fichas ampliadas y turnos](supabase/migrations/202610220003_care_profiles_and_shifts.sql)
4. [Conexión Google Calendar](supabase/migrations/202610220004_google_calendar.sql)

Si ya ejecutaste 001–003, ejecuta únicamente 004. No ejecutes estos archivos en otros proyectos de Supabase.

## Google Calendar

Consulta [la guía de configuración](docs/GOOGLE_CALENDAR.md). Las credenciales OAuth, el refresh token y la clave de cifrado se guardan como secretos de Supabase Edge Functions; no se publican en GitHub.

La integración usa OAuth con la cuenta de Google que elija la administradora. Después podrá sincronizar turnos recurrentes, citas puntuales y avisos de caducidad. Esta integración todavía requiere configuración y pruebas y no debe tratarse como activa hasta completarlas.

## Seguridad

No subas datos de personas, NIE completos, direcciones reales, contraseñas, refresh tokens ni claves privadas a GitHub. No usar datos reales hasta probar autenticación, permisos, sincronización y restauración de copias.
