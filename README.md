# CuidaGest — Portal de gestión de cuidados

Portal interno en desarrollo para organizar la selección de cuidadores, las fichas de las personas usuarias y la planificación de servicios.

## Estado actual

- Interfaz de demostración en `index.html`, `styles.css` y `app.js`.
- **Esquema inicial de base de datos preparado**, pendiente de crear y configurar un proyecto real de Supabase.
- No existe todavía conexión con la base de datos, inicio de sesión ni sincronización con Google Calendar.
- Los datos que muestra la interfaz siguen siendo ficticios y temporales. No introduzcas datos reales.

## Base de datos propuesta

Usaremos Supabase/PostgreSQL para el almacenamiento persistente, Supabase Auth para las cuentas del personal y políticas Row Level Security (RLS) para restringir el acceso. La migración inicial está en:

- [Esquema SQL inicial](supabase/migrations/202610220001_initial_schema.sql)
- [Guía de base de datos, copias de seguridad y privacidad](docs/BASE_DATOS_Y_SEGURIDAD.md)

El esquema incluye cuidadores, disponibilidad, usuarios del servicio, servicios, historial de asignaciones y registro de auditoría. **El archivo SQL no crea por sí solo una base en la nube**: debe revisarse y ejecutarse en un proyecto Supabase de desarrollo. Después hay que probar todos los permisos y la recuperación de copias antes de producción.

## Cómo probar la interfaz

Abre `index.html` en el navegador, o publica la demo con GitHub Pages. GitHub contiene solo código y documentación, no debe almacenar las fichas de las personas.

## Regla de seguridad

No subir nunca a este repositorio datos de personas, historiales de salud, direcciones, documentos, contraseñas, tokens ni claves secretas. No usar datos reales hasta que la autenticación, permisos, copias de seguridad, pruebas de restauración y obligaciones de protección de datos estén revisados.
