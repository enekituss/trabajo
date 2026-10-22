import {
  TZ, addDays, adminDb, allDayReminders, calendarApi, corsHeaders, countWeeklyOccurrences,
  freshGoogleAccessToken, isAllowedOrigin, json, requireAdmin, weekdayCode, weekdayOnOrAfter,
  timedReminders, googleDescription
} from "../_shared/calendar.ts";

function fullName(record: any) {
  return [record?.first_name, record?.last_name, record?.second_last_name].filter(Boolean).join(" ").trim() || record?.full_name || "Persona";
}
function mapsAddress(client: any) {
  return [client?.service_address, client?.postal_code, client?.service_area, client?.province].filter(Boolean).join(", ");
}
async function deleteEventIfPresent(token: string, id: string | null) {
  if (id) await calendarApi(token, "DELETE", id);
}
async function upsertEvent(token: string, existingId: string | null, body: unknown) {
  if (existingId) {
    const updated = await calendarApi(token, "PUT", existingId, body);
    if (!updated?.notFound) return updated;
  }
  return await calendarApi(token, "POST", null, body);
}
async function saveConnectionSync(db: any, userId: string, error: string | null = null) {
  await db.from("google_calendar_connections").update({
    last_sync_at: new Date().toISOString(), last_sync_error: error
  }).eq("user_id", userId);
}
async function syncShift(db: any, token: string, row: any) {
  const { data: shift, error } = await db.from("care_shifts").select("*").eq("id", row.id).maybeSingle();
  if (error || !shift) throw new Error("No se pudo encontrar el turno.");
  if (shift.status !== "active") {
    await deleteEventIfPresent(token, shift.google_event_id);
    const result = await db.from("care_shifts").update({ google_event_id: null, calendar_sync_status: "not_synced", calendar_sync_error: null }).eq("id", shift.id);
    if (result.error) throw new Error("No se pudo actualizar el estado de sincronización del turno.");
    return { synced: false, paused: true };
  }
  const [{ data: caregiver }, { data: client }] = await Promise.all([
    db.from("caregivers").select("*").eq("id", shift.caregiver_id).maybeSingle(),
    db.from("clients").select("*").eq("id", shift.client_id).maybeSingle()
  ]);
  if (!caregiver || !client) throw new Error("Falta una cuidadora o persona atendida del turno.");
  const startDate = weekdayOnOrAfter(shift.valid_from, Number(shift.weekday));
  if (shift.valid_until && startDate > shift.valid_until) {
    await deleteEventIfPresent(token, shift.google_event_id);
    await db.from("care_shifts").update({ google_event_id: null, calendar_sync_status: "not_synced", calendar_sync_error: null }).eq("id", shift.id);
    return { synced: false, skipped: true };
  }
  const recurrence = "RRULE:FREQ=WEEKLY;BYDAY=" + weekdayCode(Number(shift.weekday)) +
    (shift.valid_until ? ";COUNT=" + countWeeklyOccurrences(startDate, shift.valid_until) : "");
  const body = {
    summary: "CuidaGest · " + fullName(client),
    description: googleDescription([
      "Servicio gestionado con CuidaGest.",
      "Cuidadora: " + fullName(caregiver),
      "Tipo: " + (shift.service_type || "Atención domiciliaria"),
      "Consulta las instrucciones operativas necesarias en CuidaGest."
    ]),
    location: mapsAddress(client) || undefined,
    start: { dateTime: startDate + "T" + String(shift.start_time).slice(0, 8), timeZone: TZ },
    end: { dateTime: startDate + "T" + String(shift.end_time).slice(0, 8), timeZone: TZ },
    recurrence: [recurrence],
    reminders: timedReminders(),
    visibility: "private"
  };
  try {
    const event = await upsertEvent(token, shift.google_event_id, body);
    if (!event?.id) throw new Error("Google no devolvió el identificador del evento.");
    const result = await db.from("care_shifts").update({ google_event_id: event.id, calendar_sync_status: "synced", calendar_sync_error: null }).eq("id", shift.id);
    if (result.error) throw new Error("El evento se creó pero no se pudo guardar su referencia.");
    return { synced: true };
  } catch (e) {
    await db.from("care_shifts").update({ calendar_sync_status: "error", calendar_sync_error: "No se pudo sincronizar; intenta de nuevo." }).eq("id", shift.id);
    throw e;
  }
}
async function syncCaregiverExpiry(db: any, token: string, caregiverId: string) {
  const { data: caregiver, error } = await db.from("caregivers").select("*").eq("id", caregiverId).maybeSingle();
  if (error || !caregiver) throw new Error("No se pudo encontrar la ficha de la cuidadora.");
  const { data: oldAlerts } = await db.from("google_calendar_alerts").select("*").eq("caregiver_id", caregiverId);
  const expiry = caregiver.nie_expiry_date as string | null;
  let desired: Array<{ type: string; date: string; label: string }> = [];
  const today = new Date().toISOString().slice(0, 10);
  if (expiry && caregiver.status !== "inactive") {
    if (expiry <= today) {
      desired = [{ type: "nie_overdue", date: today, label: expiry < today ? "Revisar documento caducado" : "Revisar documento que caduca hoy" }];
    } else {
      for (const item of [{ days: 90, type: "nie_90" }, { days: 30, type: "nie_30" }, { days: 7, type: "nie_7" }]) {
        const alertDate = addDays(expiry, -item.days);
        if (alertDate >= today) desired.push({ type: item.type, date: alertDate, label: "Aviso previo a caducidad (" + item.days + " días)" });
      }
    }
  }
  const wanted = new Set(desired.map(a => a.type));
  for (const previous of oldAlerts || []) {
    if (!wanted.has(previous.alert_type)) {
      await deleteEventIfPresent(token, previous.google_event_id);
      await db.from("google_calendar_alerts").update({
        google_event_id: null, sync_status: "skipped", last_error: null
      }).eq("id", previous.id);
    }
  }
  const resultRows = [];
  for (const alert of desired) {
    const old = (oldAlerts || []).find((a: any) => a.alert_type === alert.type);
    const body = {
      summary: "CuidaGest · " + alert.label,
      description: googleDescription([
        "Aviso interno para revisar documentación.",
        "Cuidadora: " + fullName(caregiver),
        "Fecha de caducidad registrada: " + expiry,
        "No incluye el número de documento ni otros datos identificativos."
      ]),
      start: { date: alert.date }, end: { date: addDays(alert.date, 1) },
      reminders: allDayReminders(), visibility: "private"
    };
    try {
      const event = await upsertEvent(token, old?.google_event_id || null, body);
      if (!event?.id) throw new Error("Google no devolvió el identificador del aviso.");
      const { error: dbError } = await db.from("google_calendar_alerts").upsert({
        caregiver_id: caregiverId, alert_type: alert.type, alert_date: alert.date,
        google_event_id: event.id, sync_status: "synced", last_error: null
      }, { onConflict: "caregiver_id,alert_type" });
      if (dbError) throw new Error("No se pudo guardar el estado de sincronización.");
      resultRows.push({ type: alert.type, synced: true });
    } catch (_error) {
      await db.from("google_calendar_alerts").upsert({
        caregiver_id: caregiverId, alert_type: alert.type, alert_date: alert.date,
        google_event_id: old?.google_event_id || null, sync_status: "error",
        last_error: "No se pudo sincronizar este aviso; intenta de nuevo."
      }, { onConflict: "caregiver_id,alert_type" });
      resultRows.push({ type: alert.type, synced: false });
    }
  }
  return { alerts: resultRows };
}
async function syncService(db: any, token: string, serviceId: string) {
  const { data: service, error } = await db.from("services").select("*").eq("id", serviceId).maybeSingle();
  if (error || !service) throw new Error("No se pudo encontrar la cita/servicio.");
  if (service.status === "cancelled") {
    await deleteEventIfPresent(token, service.calendar_event_id);
    await db.from("services").update({ calendar_event_id: null, calendar_sync_status: "not_synced", calendar_sync_error: null }).eq("id", serviceId);
    return { synced: false, cancelled: true };
  }
  const [{ data: client }, { data: assignment }] = await Promise.all([
    db.from("clients").select("*").eq("id", service.client_id).maybeSingle(),
    db.from("service_assignments").select("caregiver_id").eq("service_id", serviceId).is("ended_at", null).maybeSingle()
  ]);
  if (!client) throw new Error("No se pudo encontrar la persona atendida.");
  let caregiver: any = null;
  if (assignment?.caregiver_id) {
    const res = await db.from("caregivers").select("*").eq("id", assignment.caregiver_id).maybeSingle();
    caregiver = res.data;
  }
  const start = new Date(service.starts_at), end = new Date(service.ends_at);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error("Las fechas de la cita no son válidas.");
  const body = {
    summary: "CuidaGest · " + fullName(client) + " · " + String(service.service_type || "Servicio"),
    description: googleDescription([
      "Servicio gestionado con CuidaGest.",
      caregiver ? "Cuidadora: " + fullName(caregiver) : "Cuidadora pendiente de asignación.",
      "Revisa la información operativa en CuidaGest."
    ]),
    location: mapsAddress(client) || undefined,
    start: { dateTime: start.toISOString(), timeZone: TZ },
    end: { dateTime: end.toISOString(), timeZone: TZ },
    reminders: timedReminders(), visibility: "private"
  };
  try {
    const event = await upsertEvent(token, service.calendar_event_id || null, body);
    if (!event?.id) throw new Error("Google no devolvió el identificador del evento.");
    const result = await db.from("services").update({
      calendar_provider: "google", calendar_event_id: event.id, calendar_sync_status: "synced", calendar_sync_error: null
    }).eq("id", serviceId);
    if (result.error) throw new Error("El evento se creó pero no se pudo guardar su referencia.");
    return { synced: true, event_id: event.id };
  } catch (e) {
    await db.from("services").update({ calendar_sync_status: "error", calendar_sync_error: "No se pudo sincronizar; intenta de nuevo." }).eq("id", serviceId);
    throw e;
  }
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (!isAllowedOrigin(req.headers.get("origin"))) return json({ error: "Origen no permitido." }, 403, headers);
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405, headers);

  try {
    const { db, user } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const connection = await db.from("google_calendar_connections").select("connected_google_email, connected_at, calendar_id")
      .eq("user_id", user.id).maybeSingle();
    if (connection.error) throw new Error("No se pudo consultar la conexión con Google Calendar.");
    if (action === "status") {
      return json({ connected: Boolean(connection.data), email: connection.data?.connected_google_email || null, connected_at: connection.data?.connected_at || null }, 200, headers);
    }
    if (!connection.data) return json({ error: "Google Calendar no está conectado. Pulsa «Conectar Google Calendar»." }, 409, headers);

    const { token } = await freshGoogleAccessToken(db, user.id);
    let result: unknown;
    if (action === "sync_shift" && typeof body.shift_id === "string") {
      result = await syncShift(db, token, { id: body.shift_id });
    } else if (action === "sync_caregiver_expiry" && typeof body.caregiver_id === "string") {
      result = await syncCaregiverExpiry(db, token, body.caregiver_id);
    } else if (action === "sync_service" && typeof body.service_id === "string") {
      result = await syncService(db, token, body.service_id);
    } else if (action === "sync_all") {
      const [careRes, shiftRes, serviceRes] = await Promise.all([
        db.from("caregivers").select("id").not("nie_expiry_date", "is", null).limit(80),
        db.from("care_shifts").select("id").limit(120),
        db.from("services").select("id").limit(80)
      ]);
      if (careRes.error || shiftRes.error || serviceRes.error) throw new Error("No se pudieron leer todos los registros para sincronizar.");
      let ok = 0, failed = 0;
      const errors: string[] = [];
      for (const row of careRes.data || []) {
        try { await syncCaregiverExpiry(db, token, row.id); ok++; } catch (_error) { failed++; errors.push("Un aviso de documentación no se pudo sincronizar."); }
      }
      for (const row of shiftRes.data || []) {
        try { await syncShift(db, token, row); ok++; } catch (_error) { failed++; errors.push("Un turno no se pudo sincronizar."); }
      }
      for (const row of serviceRes.data || []) {
        try { await syncService(db, token, row.id); ok++; } catch (_error) { failed++; errors.push("Una cita no se pudo sincronizar."); }
      }
      result = { ok, failed, partial: (careRes.data?.length || 0) === 80 || (shiftRes.data?.length || 0) === 120 || (serviceRes.data?.length || 0) === 80, errors: errors.slice(0, 5) };
    } else {
      return json({ error: "Acción no válida." }, 400, headers);
    }
    await saveConnectionSync(db, user.id, null);
    return json({ success: true, result }, 200, headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al sincronizar Google Calendar.";
    const status = /sesión|autorizada|administradora/i.test(message) ? 403 : /no está conectado/i.test(message) ? 409 : 500;
    try {
      // Only write a generic error; never expose tokens or provider response bodies.
      const auth = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (auth) {
        const db = adminDb();
        const u = await db.auth.getUser(auth);
        if (u.data.user) await saveConnectionSync(db, u.data.user.id, "Error de sincronización; comprueba los ajustes.");
      }
    } catch { /* no further details */ }
    return json({ error: message }, status, headers);
  }
});
