# CuidaGest — Portal de gestión de cuidados

Portal interno en desarrollo para organizar cuidadoras, personas usuarias, turnos semanales y alertas operativas.

## Estado actual

- Pantalla de inicio de sesión con Supabase Auth preparada.
- El panel requiere una sesión autenticada y un perfil administrador activo.
- Las fichas y turnos usan un esquema de datos en Supabase, pendiente de conectar con la URL y clave pública del proyecto nuevo en `supabase-config.js`.
- No introduzcas datos reales mientras no se hayan configurado y probado acceso, tablas y copias de seguridad.

## Base de datos

Archivos que deben ejecutarse **solo en el proyecto nuevo de CuidaGest** y en orden:

1. [Esquema inicial](supabase/migrations/202610220001_initial_schema.sql)
2. [Único administrador](supabase/migrations/202610220002_single_admin.sql)
3. [Fichas ampliadas y turnos recurrentes](supabase/migrations/202610220003_care_profiles_and_shifts.sql)

La migración 003 añade datos de perfil, estados y etiquetas de cuidadores, más turnos semanales repetibles, validez de fecha y bloqueo de solapamientos.

## Funcionalidades previstas en el cliente web

- Dashboard con contadores, avisos de caducidad de documentos y turnos próximos.
- Altas, edición, búsqueda y etiquetas de cuidadoras.
- Altas y edición de usuarios del servicio y sus direcciones.
- Planificador recurrente por día y franja horaria.
- Enlaces de Google Maps para abrir rutas a las ubicaciones guardadas.

La integración de Google Maps comienza con URLs de búsqueda/ruta y no requiere una API key. La sincronización con Google Calendar y avisos por correo se deja para una fase segura posterior.

## Configuración

Completa `supabase-config.js` con la Project URL y la publishable key del proyecto CuidaGest. No subas contraseñas, NIE, direcciones reales ni claves secretas a GitHub.
