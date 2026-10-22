# Google Calendar: integración segura de CuidaGest

## Diseño

El navegador nunca recibirá el token de actualización de Google ni el secreto OAuth. El flujo será:

1. La administradora inicia sesión en CuidaGest con Supabase.
2. Pulsa «Conectar Google Calendar» y la aplicación solicita a una Edge Function autenticada una URL de autorización.
3. Google pide consentimiento para gestionar eventos del calendario de la cuenta elegida.
4. Google devuelve al callback de Supabase un código OAuth y un estado de un solo uso.
5. La Edge Function comprueba el estado, cambia el código por tokens y cifra el refresh token con una clave AES-GCM almacenada solo como secreto de Edge Functions.
6. Al crear/editar una cuidadora, turno o servicio, CuidaGest puede sincronizar eventos y recordatorios con Google Calendar mediante otra Edge Function.

Las funciones se validan contra Supabase Auth y el perfil administrador activo. La migración 004 bloquea el acceso directo desde el navegador a los tokens y a la tabla de estados OAuth.

## Migraciones

Ejecuta la migración `supabase/migrations/202610220004_google_calendar.sql` únicamente en el proyecto CuidaGest, después de las migraciones 001, 002 y 003. Si aún no están aplicadas, ejecútalas en orden. No ejecutes ningún SQL en tus otros proyectos.

## Preparación de Google Cloud

1. Accede a https://console.cloud.google.com/ con la cuenta de Google que gestionará el calendario.
2. Crea un proyecto de Google Cloud dedicado a CuidaGest (esto no cambia tus otros proyectos).
3. En APIs & Services → Library, habilita **Google Calendar API**.
4. En Google Auth Platform configura la pantalla de consentimiento: nombre de la aplicación CuidaGest y correo de soporte. Si la aplicación se queda en modo Testing, añade la cuenta de Google que la va a autorizar como test user.
5. En Clients, crea un **OAuth client ID** de tipo **Web application**.
6. Añade como URI de redirección autorizada el valor exacto de `GOOGLE_REDIRECT_URI`. En el despliegue de Supabase debe ser:
   `https://kvbnczvxgxkaquenszbr.supabase.co/functions/v1/google-calendar-callback`
   Esta URL corresponde al proyecto que está configurado actualmente en `supabase-config.js`. Antes de usarla, confirma que ese es el proyecto CuidaGest correcto; la URL de redirección debe coincidir exactamente.
7. Guarda el Client ID y el Client secret fuera de GitHub.

La integración pide scopes mínimos: `openid`, `email` y `https://www.googleapis.com/auth/calendar.events.owned` para trabajar con eventos de calendarios que la cuenta posee.

**Importante para el uso diario:** según Google, si la aplicación está configurada como External y su estado de publicación es Testing, los refresh tokens que usan scopes de Calendar caducan a los 7 días (salvo que solo se usen scopes básicos de identidad). Para que una integración empresarial siga funcionando de forma continua, configura correctamente la audiencia y el estado de publicación; según el tipo de cuenta y de uso, Google puede exigir verificación de scopes sensibles. Consulta la documentación oficial antes de producción: https://developers.google.com/identity/protocols/oauth2/ y https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification.

## Secretos de Supabase Edge Functions

En Supabase, proyecto CuidaGest → Edge Functions → Secrets, configura:

- `GOOGLE_CLIENT_ID`: OAuth Client ID de Google Cloud.
- `GOOGLE_CLIENT_SECRET`: OAuth Client secret.
- `GOOGLE_REDIRECT_URI`: callback exacto de la función.
- `CUIDAGEST_APP_URL`: URL web final, por ejemplo `https://enekituss.github.io/trabajo/`.
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: clave aleatoria Base64 que decodifique a 32 bytes. No se sube a GitHub.

Ejemplo local para generar la clave de cifrado en un terminal con OpenSSL:
`openssl rand -base64 32`

No compartas estos valores en chats, commits o capturas. No uses la clave `service_role` en el navegador.

## Funciones que se despliegan

- `google-calendar-connect`: requiere JWT de Supabase, genera OAuth state aleatorio y devuelve la URL de autorización.
- `google-calendar-callback`: callback sin JWT (Google no manda la sesión de Supabase); comprueba el estado de un solo uso y almacena el refresh token cifrado.
- `google-calendar-sync`: requiere sesión de la administradora y permite ver estado, sincronizar turnos, recordatorios de caducidad y servicios concretos, o sincronizar lo pendiente.

El callback debe ser la única función pública y comprueba un state de un solo uso con caducidad. En `supabase/config.toml` se configura `verify_jwt = false` exclusivamente para ese callback. Las otras funciones mantienen la validación JWT.

## Desplegar las funciones con Supabase CLI

La carpeta local debe contener el repositorio y sus carpetas `supabase/functions` y `supabase/config.toml`. Desde un terminal, dentro de esa carpeta, y habiendo instalado Supabase CLI, ejecuta:

- `npx supabase login`
- `npx supabase functions deploy google-calendar-connect --project-ref kvbnczvxgxkaquenszbr`
- `npx supabase functions deploy google-calendar-callback --no-verify-jwt --project-ref kvbnczvxgxkaquenszbr`
- `npx supabase functions deploy google-calendar-sync --project-ref kvbnczvxgxkaquenszbr`

Antes de ejecutar, confirma que `kvbnczvxgxkaquenszbr` es el ref de CuidaGest. No uses los comandos en una carpeta o proyecto distinto. Las variables secretas deben añadirse en Edge Functions → Secrets antes de probar las funciones.

## Qué se sincroniza

- Turnos: eventos semanales recurrentes en Europe/Madrid.
- NIE/documento: avisos en fechas 90, 30 y 7 días antes; si está vencido, un aviso de revisión para hoy. Solo se almacena la fecha de caducidad y no el número completo del NIE.
- Servicios/citas puntuales: hora de inicio y fin, cuidadora asignada, tipo de servicio y ubicación.

Google Calendar puede aplicar recordatorios por correo y popup. Los avisos de caducidad se representarán como eventos en la fecha del aviso, porque los recordatorios de un único evento de Calendar tienen un límite de tiempo previo.

## Privacidad

El calendario de Google procesa datos transferidos desde CuidaGest. Mantén las descripciones sin diagnósticos ni detalles de salud; incluye solo la información operativa necesaria, y revisa con la empresa la autorización de Google y las obligaciones de protección de datos. Los eventos pueden incluir una dirección solo si hace falta para acudir al servicio.

## Requisitos antes de usar con información real

- Ejecutar y probar todas las migraciones en el proyecto correcto.
- Crear y probar el único perfil administrador.
- Desplegar funciones y configurar secretos.
- Probar creación de citas puntuales, alta/edición de cuidadoras, pausa/reactivación de turnos y cambios de caducidad del documento.
- Asegurar que no se dupliquen eventos tras reintentar una operación.
- Confirmar el tratamiento de datos y los permisos de calendario.
- Probar copia de seguridad y recuperación.
