import { createClient } from "npm:@supabase/supabase-js@2";

export const APP_URL = (Deno.env.get("CUIDAGEST_APP_URL") || "https://enekituss.github.io/trabajo/").replace(/\/$/, "") + "/";
export const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI") || "https://kvbnczvxgxkaquenszbr.supabase.co/functions/v1/google-calendar-callback";
export const CALENDAR_SCOPE = "openid email https://www.googleapis.com/auth/calendar.events.owned";
export const TZ = "Europe/Madrid";

export function adminDb() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Faltan las variables internas de Supabase para la función.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const configured = (Deno.env.get("CUIDAGEST_APP_URL") || APP_URL);
  const allowed = new Set<string>([new URL(configured).origin, "http://localhost:5500", "http://127.0.0.1:5500"]);
  const safeOrigin = origin && allowed.has(origin) ? origin : new URL(configured).origin;
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8"
  };
}
export function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  const configured = (Deno.env.get("CUIDAGEST_APP_URL") || APP_URL);
  return origin === new URL(configured).origin || origin === "http://localhost:5500" || origin === "http://127.0.0.1:5500";
}
export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
}
export async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("Falta la sesión de Supabase.");
  const db = adminDb();
  const { data: authData, error: authError } = await db.auth.getUser(token);
  if (authError || !authData.user) throw new Error("La sesión no es válida. Inicia sesión de nuevo.");
  const { data: profile, error: profileError } = await db.from("staff_profiles")
    .select("display_name, role, is_active")
    .eq("id", authData.user.id).maybeSingle();
  if (profileError || !profile || profile.role !== "admin" || profile.is_active !== true) {
    throw new Error("La cuenta no está autorizada como administradora activa.");
  }
  return { db, user: authData.user, profile };
}
export function randomBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
export async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("");
}
function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
function encodeBase64(value: Uint8Array) {
  let binary = "";
  for (const b of value) binary += String.fromCharCode(b);
  return btoa(binary);
}
function encryptionKey() {
  const value = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (!value) throw new Error("Falta el secreto GOOGLE_TOKEN_ENCRYPTION_KEY.");
  const bytes = decodeBase64(value.trim());
  if (bytes.length !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY debe ser Base64 de 32 bytes.");
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
export async function encryptToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key, new TextEncoder().encode(value)));
  const joined = new Uint8Array(iv.length + ciphertext.length);
  joined.set(iv, 0);
  joined.set(ciphertext, iv.length);
  return encodeBase64(joined);
}
export async function decryptToken(value: string) {
  const bytes = decodeBase64(value);
  if (bytes.length < 29) throw new Error("El token cifrado de Google no es válido.");
  const iv = bytes.slice(0, 12), ciphertext = bytes.slice(12);
  const key = await encryptionKey();
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
export async function loadCalendarConnection(db: any, userId: string) {
  const { data, error } = await db.from("google_calendar_connections").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}
export async function freshGoogleAccessToken(db: any, userId: string) {
  const connection = await loadCalendarConnection(db, userId);
  if (!connection?.encrypted_refresh_token) throw new Error("Google Calendar aún no está conectado.");
  const refreshToken = await decryptToken(connection.encrypted_refresh_token);
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Faltan los secretos OAuth de Google.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: "refresh_token"
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    await db.from("google_calendar_connections").update({ last_sync_error: "No se pudo renovar el acceso de Google; vuelve a conectar el calendario." }).eq("user_id", userId);
    throw new Error("No se pudo renovar el acceso a Google Calendar. Vuelve a conectar la cuenta.");
  }
  return { token: body.access_token as string, connection };
}
export async function calendarApi(token: string, method: string, eventId: string | null, body?: unknown) {
  const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const url = eventId ? base + "/" + encodeURIComponent(eventId) : base;
  const response = await fetch(url, {
    method,
    headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (response.status === 404 && method === "DELETE") return null;
  if (response.status === 404) return { notFound: true };
  if (response.status === 204) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error("Google Calendar devolvió un error " + response.status + ". Revisa los permisos y la conexión.");
  }
  return result;
}
export function allDayReminders() {
  return { useDefault: false, overrides: [{ method: "popup", minutes: 60 }, { method: "email", minutes: 1440 }] };
}
export function timedReminders() {
  return { useDefault: false, overrides: [{ method: "popup", minutes: 60 }, { method: "email", minutes: 1440 }] };
}
export function dayString(date: Date) {
  return date.getUTCFullYear().toString().padStart(4, "0") + "-" +
    (date.getUTCMonth() + 1).toString().padStart(2, "0") + "-" + date.getUTCDate().toString().padStart(2, "0");
}
export function addDays(isoDate: string, days: number) {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return dayString(d);
}
export function weekdayOnOrAfter(start: string, weekday: number) {
  const d = new Date(start + "T12:00:00Z");
  const isoWeekday = ((d.getUTCDay() + 6) % 7) + 1;
  d.setUTCDate(d.getUTCDate() + ((weekday - isoWeekday + 7) % 7));
  return dayString(d);
}
export function weekdayCode(weekday: number) {
  return ["", "MO", "TU", "WE", "TH", "FR", "SA", "SU"][weekday] || "MO";
}
export function countWeeklyOccurrences(start: string, until: string) {
  const diff = new Date(until + "T12:00:00Z").getTime() - new Date(start + "T12:00:00Z").getTime();
  return Math.floor(diff / (7 * 86400000)) + 1;
}
export function googleDescription(lines: Array<string | null | undefined>) {
  return lines.filter(Boolean).join("\n").slice(0, 7000);
}
