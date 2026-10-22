# CuidaGest — Portal de gestión de cuidados

Portal interno en desarrollo para organizar la selección de cuidadores, las fichas de las personas usuarias y la planificación de servicios.

## Estado actual

- Interfaz de demostración en `index.html`, `styles.css` y `app.js`.
- Pantalla de inicio de sesión preparada con Supabase Auth.
- Verificación del perfil administrador activo contra `staff_profiles`.
- La conexión real está pendiente de configurar los valores del proyecto en `supabase-config.js`.
- Tras iniciar sesión, la interfaz continúa siendo una **demo con datos ficticios**: los formularios todavía no están conectados a las tablas.

## Única cuenta autorizada

La cuenta de tu madre será la única cuenta interna. No hay botón para registrarse. En Supabase, desactiva **Allow new users to sign up**, crea la cuenta desde el panel de autenticación y añade su UUID a `public.staff_profiles` con rol `admin`.

La sesión se guarda en `sessionStorage`; normalmente pedirá iniciar sesión de nuevo al cerrar la pestaña. La seguridad de los datos depende de Supabase Auth y las políticas RLS, no solo de la pantalla de acceso.

## Base de datos

- [Esquema inicial](supabase/migrations/202610220001_initial_schema.sql)
- [Migración para un único administrador](supabase/migrations/202610220002_single_admin.sql)
- [Guía de base de datos, copias y privacidad](docs/BASE_DATOS_Y_SEGURIDAD.md)

En un proyecto nuevo, ejecuta las dos migraciones en orden. No las ejecutes en los proyectos existentes de Supabase que utilices para otras cosas.

## Configuración del inicio de sesión

En el proyecto Supabase de CuidaGest, copia la **Project URL** y la **publishable key** desde la sección API Keys/API settings y pégalas en `supabase-config.js`. Solo se debe usar la URL y la clave pública/publishable en el navegador. Nunca la `service_role` ni una secret key.

En Authentication, desactiva las altas públicas de cuentas y añade la URL final de la web a las URL permitidas de autenticación. GitHub Pages puede servir la interfaz, pero las fichas se guardarán en Supabase, no en GitHub.

## Regla de seguridad

No subir datos personales, información de salud, direcciones, documentos identificativos, contraseñas, tokens ni claves privadas a este repositorio. No usar datos reales hasta que autenticación, permisos, persistencia, copias de seguridad y restauración estén probados.
