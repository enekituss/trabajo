# CuidaGest — Portal de gestión de cuidados

Portal interno en desarrollo para gestionar cuidadoras, personas atendidas, turnos semanales y avisos operativos.

## Estado actual

- Pantalla de inicio de sesión con Supabase Auth; al entrar con la cuenta administradora, abre el panel de control.
- Formularios para crear/editar cuidadoras y personas atendidas y crear turnos semanales recurrentes.
- Fichas, estados, etiquetas, fechas de caducidad de documentos y turnos se cargan/guardan en Supabase cuando se configura la conexión y las migraciones.
- El dashboard muestra avisos para documentos caducados/próximos a caducar y turnos próximos.
- Los turnos y fichas con dirección pueden abrir una ruta de Google Maps.
- Falta introducir la Project URL y la publishable key del proyecto nuevo en `supabase-config.js`, ejecutar las migraciones que correspondan y probar el flujo de extremo a extremo.
- No hay aún avisos por correo ni sincronización con Google Calendar. Los enlaces de Google Maps tampoco envían notificaciones.

## Base de datos

Ejecuta estos archivos **solo en el proyecto nuevo de CuidaGest**, en orden:

1. [Esquema inicial](supabase/migrations/202610220001_initial_schema.sql)
2. [Único administrador](supabase/migrations/202610220002_single_admin.sql)
3. [Fichas ampliadas y turnos recurrentes](supabase/migrations/202610220003_care_profiles_and_shifts.sql)

Si ya ejecutaste las dos primeras migraciones en el proyecto nuevo, ejecuta únicamente la tercera. No las ejecutes en tus otros proyectos de Supabase.

## Configuración

En `supabase-config.js`, añade la Project URL y la publishable key del proyecto CuidaGest. Esta clave está diseñada para uso público, pero el acceso depende de que las políticas RLS estén bien aplicadas. Nunca incluyas `service_role`, secret keys, contraseñas, tokens privados ni datos personales en GitHub.

En Supabase Auth, desactiva el registro público de usuarios y crea la única cuenta desde el panel. Después, añade su UUID a `public.staff_profiles` con rol `admin`.

## Seguridad y puesta en producción

No introduzcas datos reales hasta comprobar que el proyecto y las migraciones son correctos, que la cuenta autorizada es la única que puede acceder, que los permisos se aplican en la base de datos y que existen copias de seguridad y pruebas de restauración. Revisar también con la empresa la minimización de datos y las obligaciones de privacidad.
