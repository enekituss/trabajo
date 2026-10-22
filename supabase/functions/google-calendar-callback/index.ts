import { APP_URL, GOOGLE_REDIRECT_URI, adminDb, encryptToken, sha256Hex } from "../_shared/calendar.ts";

function redirectResult(result: string) {
  const url = new URL(APP_URL);
  url.searchParams.set("calendar", result);
  return Response.redirect(url.toString(), 303);
}
function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const incoming = new URL(req.url);
  const oauthError = incoming.searchParams.get("error");
  if (oauthError) {
    // No mostramos parámetros crudos ni el detalle de OAuth al usuario.
    return redirectResult("denied");
  }
  const code = incoming.searchParams.get("code");
  const state = incoming.searchParams.get("state");
  if (!code || !state || state.length > 500) return redirectResult("error");

  try {
    const db = adminDb();
    const hash = await sha256Hex(state);
    const now = new Date().toISOString();
    const { data: row, error: stateError } = await db.from("google_oauth_states")
      .select("state_hash, user_id, expires_at, used_at")
      .eq("state_hash", hash).gt("expires_at", now).is("used_at", null).maybeSingle();
    if (stateError || !row) return redirectResult("error");

    // Consumo de un solo uso antes del intercambio del código para evitar replays.
    const { data: consumed, error: consumeError } = await db.from("google_oauth_states")
      .update({ used_at: now }).eq("state_hash", hash).is("used_at", null).gt("expires_at", now)
      .select("state_hash").maybeSingle();
    if (consumeError || !consumed) return redirectResult("error");

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) return redirectResult("error");

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: GOOGLE_REDIRECT_URI, grant_type: "authorization_code"
      })
    });
    const tokens = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokens.access_token) return redirectResult("error");

    let refreshToken = tokens.refresh_token as string | undefined;
    // Google may omit a refresh token if the user already granted access before.
    // Reuse an existing encrypted token only for this same initiating account.
    if (!refreshToken) {
      const { data: existing } = await db.from("google_calendar_connections").select("encrypted_refresh_token")
        .eq("user_id", row.user_id).maybeSingle();
      if (existing?.encrypted_refresh_token) {
        // Preserve existing ciphertext without decrypting it in the callback.
        refreshToken = undefined;
      } else {
        return redirectResult("needs_reconsent");
      }
    }

    let googleEmail: string | null = null;
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: "Bearer " + tokens.access_token }
    });
    if (userResponse.ok) {
      const userData = await userResponse.json().catch(() => ({}));
      googleEmail = typeof userData.email === "string" ? userData.email.slice(0, 254) : null;
    }

    const { data: existing } = await db.from("google_calendar_connections").select("*")
      .eq("user_id", row.user_id).maybeSingle();
    const encrypted = refreshToken ? await encryptToken(refreshToken) : existing?.encrypted_refresh_token;
    if (!encrypted) return redirectResult("error");

    const scopes = typeof tokens.scope === "string" ? tokens.scope.split(" ").filter(Boolean) : [];
    const { error: saveError } = await db.from("google_calendar_connections").upsert({
      user_id: row.user_id,
      connected_google_email: googleEmail || existing?.connected_google_email || null,
      calendar_id: existing?.calendar_id || "primary",
      encrypted_refresh_token: encrypted,
      granted_scopes: scopes.length ? scopes : existing?.granted_scopes || [],
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_sync_error: null
    }, { onConflict: "user_id" });
    if (saveError) return redirectResult("error");
    return redirectResult("connected");
  } catch (_error) {
    // No token, OAuth code, secret or personal data is written to logs.
    return redirectResult("error");
  }
});
