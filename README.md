# CuidaGest — Portal de gestión de cuidados

Portal interno en desarrollo para organizar la selección de cuidadores, las fichas de las personas usuarias y la planificación de servicios.

## Estado actual

- Interfaz de demostración en `index.html`, `styles.css` y `app.js`.
- Esquema de base de datos preparado, pendiente de crear/configurar un proyecto real de Supabase.
- La única cuenta prevista inicialmente es la de tu madre, como administradora.
- La web todavía no está conectada a Supabase ni tiene autenticación o sincronización real con Google Calendar.
- Los datos de la interfaz son ficticios y temporales. No introduzcas datos reales.

## Base de datos propuesta

Usaremos Supabase/PostgreSQL, Supabase Auth y políticas Row Level Security (RLS). Las migraciones están en:

- [Esquema inicial](supabase/migrations/202610220001_initial_schema.sql)
- [Migración para un único administrador](supabase/migrations/202610220002_single_admin.sql)
- [Guía de base de datos, copias y privacidad](docs/BASE_DATOS_Y_SEGURIDAD.md)

En un proyecto nuevo, ejecuta las dos migraciones en orden. Si ya ejecutaste la primera, ejecuta solamente la segunda. Comprueba el nombre del proyecto antes de ejecutar SQL.

GitHub almacena código y documentación, no fichas personales. No usar datos reales hasta que se conecten y prueben el inicio de sesión, los permisos y las copias de seguridad/restauración.
