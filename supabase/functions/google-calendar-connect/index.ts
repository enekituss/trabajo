import { APP_URL, CALENDAR_SCOPE, GOOGLE_REDIRECT_URI, adminDb, corsHeaders, isAllowedOrigin, json, randomBase64Url, requireAdmin, sha256Hex } from "../_shared/calendar.ts";

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (!isAllowedOrigin(req.headers.get("origin"))) return json({ error: "Origen no permitido." }, 403, headers);
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405, headers);

  try {
    const { db, user } = await requireAdmin(req);
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return json({ error: "Google Calendar aún no está configurado en los secretos de Supabase." }, 503, headers);
    }
    if (!Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY")) {
      return json({ error: "Falta configurar la clave de cifrado de tokens de Google." }, 503, headers);
    }

    const random = crypto.getRandomValues(new Uint8Array(32));
    const state = randomBase64Url(random);
    const stateHash = await sha256Hex(state);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertError } = await db.from("google_oauth_states").insert({
      state_hash: stateHash, user_id: user.id, expires_at: expiresAt
    });
    if (insertError) {
      console.error("No se pudo iniciar OAuth (sin guardar detalles privados).");
      return json({ error: "No se pudo iniciar la conexión. Comprueba que ejecutaste la migración 004." }, 500, headers);
    }

    const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    oauthUrl.searchParams.set("client_id", clientId);
    oauthUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("scope", CALENDAR_SCOPE);
    oauthUrl.searchParams.set("access_type", "offline");
    oauthUrl.searchParams.set("prompt", "consent");
    oauthUrl.searchParams.set("include_granted_scopes", "true");
    oauthUrl.searchParams.set("state", state);
    return json({ url: oauthUrl.toString(), expires_in_seconds: 600 }, 200, headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar la conexión.";
    const status = /sesión|autorizada|administradora/i.test(message) ? 403 : 500;
    return json({ error: message }, status, headers);
  }
});
