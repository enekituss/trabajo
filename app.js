// CuidaGest — cliente web conectado a Supabase.
// La autorización se comprueba en Supabase Auth y mediante RLS.
// No guardar datos reales hasta comprobar las políticas y la recuperación de copias.

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const STATUS_LABELS = {
  new_candidate: "Nueva candidata",
  under_review: "En estudio",
  interview_scheduled: "Entrevista prevista",
  approved: "Apta",
  not_suitable: "No apta",
  inactive: "Inactiva"
};
const CLIENT_STATUS_LABELS = { active: "Activo", paused: "Pausado", closed: "Cerrado" };
const DAY_NAMES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const $STATUS_CLASS = (status) => {
  if (["approved", "active"].includes(status)) return "chip-approved";
  if (["not_suitable", "inactive", "closed"].includes(status)) return "chip-rejected";
  if (["paused", "new_candidate", "under_review", "interview_scheduled"].includes(status)) return "chip-review";
  return "chip-planned";
};
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[ch]));
const initialsFor = (name) => String(name || "").trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toLocaleUpperCase("es") || "").join("");
const fullName = (record) => {
  if (!record) return "Sin asignar";
  const made = [record.first_name, record.last_name, record.second_last_name].filter(Boolean).join(" ").trim();
  return made || record.full_name || "Sin nombre";
};
const parseList = (value) => [...new Set(String(value || "").split(",").map(v => v.trim()).filter(Boolean))].slice(0, 30);
const dateForInput = (value) => value ? String(value).slice(0, 10) : "";
const formatDate = (value) => {
  if (!value) return "Sin fecha";
  const date = new Date(String(value).slice(0, 10) + "T12:00:00");
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
};
const todayIso = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
};
const dayDistance = (dateValue) => {
  const today = new Date(todayIso() + "T12:00:00");
  const due = new Date(String(dateValue).slice(0, 10) + "T12:00:00");
  return Math.round((due - today) / 86400000);
};
const formatTime = (time) => String(time || "").slice(0, 5);
const mapsUrl = (client) => {
  const address = [client?.service_address, client?.postal_code, client?.service_area, client?.province].filter(Boolean).join(", ");
  return address ? "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(address) : "";
};
const personMarkup = (record, subtitle = "") => {
  const name = fullName(record);
  const color = (record?.id || "").toString().charCodeAt(0) % 3;
  const klass = ["", "alt1", "alt2"][color];
  return `<div class="person-cell"><span class="person-avatar ${klass}">${safe(initialsFor(name))}</span><span>${safe(name)}${subtitle ? `<span class="person-sub">${safe(subtitle)}</span>` : ""}</span></div>`;
};
const statusChip = (status, client = false) => {
  const labels = client ? CLIENT_STATUS_LABELS : STATUS_LABELS;
  return `<span class="status-chip ${$STATUS_CLASS(status)}">${safe(labels[status] || status || "Sin estado")}</span>`;
};

let authClient = null;
let currentUser = null;
let caregivers = [];
let clients = [];
let shifts = [];
let services = [];
let calendarConnected = false;
let modalType = "caregiver";
let editingId = null;
let toastTimer = null;
let loadingData = false;
let sessionCheckId = 0;

function toast(message, isError = false) {
  const element = $("#toast");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("toast-error", isError);
  element.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => element.classList.remove("show"), 3500);
}
function setAuthMessage(message = "") {
  $("#login-message").textContent = message;
  $("#login-message").classList.toggle("visible", Boolean(message));
}
function setLoginBusy(busy) {
  const button = $("#login-submit");
  button.disabled = busy || !authClient;
  button.textContent = busy ? "Comprobando acceso…" : "Iniciar sesión →";
}
function showLogin(message = "") {
  $("#app-shell").hidden = true;
  $("#login-shell").hidden = false;
  if (message) setAuthMessage(message);
}
function showView(name) {
  const names = { dashboard: "Panel de control", caregivers: "Cuidadoras", clients: "Personas atendidas", shifts: "Turnos y asignaciones" };
  if (!names[name]) return;
  $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + name));
  $$(".nav-item[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  $("#breadcrumb-title").textContent = names[name];
  $("#sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function setSignedInProfile(profile, user) {
  const name = profile.display_name || "Administradora";
  $("#signed-in-name").textContent = name;
  $("#signed-in-email").textContent = user.email || "Cuenta autorizada";
  $("#topbar-avatar").textContent = initialsFor(name);
  $("#sidebar-avatar").textContent = initialsFor(name);
}

async function verifySession(session, navigateDashboard = false) {
  const thisCheck = ++sessionCheckId;
  if (!session?.user?.id) {
    currentUser = null;
    showLogin();
    return false;
  }
  $("#login-config-status").textContent = "Verificando permisos de la cuenta…";
  const { data: profile, error } = await authClient
    .from("staff_profiles")
    .select("display_name, role, is_active")
    .eq("id", session.user.id)
    .maybeSingle();
  if (thisCheck !== sessionCheckId) return false;
  if (error || !profile || profile.role !== "admin" || profile.is_active !== true) {
    await authClient.auth.signOut({ scope: "local" });
    $("#login-config-status").textContent = "La cuenta no figura como administradora activa.";
    showLogin("Esta cuenta no tiene acceso autorizado a CuidaGest. Revisa el perfil en Supabase.");
    return false;
  }
  currentUser = session.user;
  setSignedInProfile(profile, session.user);
  $("#login-shell").hidden = true;
  $("#app-shell").hidden = false;
  $("#login-config-status").textContent = "Sesión verificada";
  // La entrada correcta siempre lleva al dashboard, incluso si antes estaba en otro menú.
  if (navigateDashboard) showView("dashboard");
  await refreshData();
  return true;
}

async function initializeAuth() {
  const config = window.CUIDAGEST_CONFIG || {};
  const url = String(config.supabaseUrl || "").trim();
  const key = String(config.supabasePublishableKey || "").trim();
  if (!window.supabase?.createClient) {
    $("#login-config-status").textContent = "No se ha podido cargar la biblioteca de autenticación. Comprueba Internet.";
    setLoginBusy(true);
    return;
  }
  if (!url || !key) {
    $("#login-config-status").textContent = "Falta la URL y la clave pública del proyecto en supabase-config.js.";
    setAuthMessage("La pantalla está preparada, pero hay que conectar el proyecto nuevo de Supabase.");
    setLoginBusy(true);
    return;
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
    $("#login-config-status").textContent = "La URL configurada no parece una URL válida de Supabase.";
    setAuthMessage("Revisa la URL del proyecto en supabase-config.js.");
    setLoginBusy(true);
    return;
  }
  try {
    authClient = window.supabase.createClient(url.replace(/\/$/, ""), key, {
      auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    setLoginBusy(false);
    authClient.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (event === "SIGNED_OUT" || !session) {
          currentUser = null;
          showLogin();
        } else if (event === "SIGNED_IN") {
          void verifySession(session, true);
        } else if (event === "TOKEN_REFRESHED") {
          // No hace falta volver a cargar todas las fichas por renovar el token.
        }
      }, 0);
    });
    const { data, error } = await authClient.auth.getSession();
    if (error) {
      $("#login-config-status").textContent = "No se ha podido comprobar la sesión.";
      showLogin("No se pudo comprobar la sesión. Inténtalo de nuevo.");
      return;
    }
    await verifySession(data.session, Boolean(data.session));
  } catch (_error) {
    $("#login-config-status").textContent = "No se ha podido conectar con Supabase.";
    setAuthMessage("No se ha podido conectar. Comprueba la URL y la clave pública.");
    setLoginBusy(true);
  }
}

async function invokeCalendar(action, payload = {}, quiet = false) {
  if (!authClient || !currentUser) return { ok: false, error: "Inicia sesión primero." };
  try {
    const response = await authClient.functions.invoke("google-calendar-sync", { body: Object.assign({ action }, payload) });
    const data = response.data, error = response.error;
    if (error || (data && data.error)) {
      const message = (data && data.error) || "No se pudo completar la operación de Google Calendar.";
      if (!quiet) toast(message, true);
      return { ok: false, error: message };
    }
    return { ok: true, data };
  } catch (_error) {
    const message = "No se pudo conectar con la función de Google Calendar. Comprueba que la has desplegado.";
    if (!quiet) toast(message, true);
    return { ok: false, error: message };
  }
}
async function refreshCalendarStatus() {
  const label = $("#calendar-connection-status");
  const connect = $("#connect-google-calendar");
  const sync = $("#sync-google-calendar");
  if (!label || !connect || !sync || !authClient || !currentUser) return;
  const result = await invokeCalendar("status", {}, true);
  calendarConnected = result.ok && Boolean(result.data && result.data.connected);
  if (calendarConnected) {
    label.textContent = "Conectado con " + (result.data.email || "Google Calendar");
    connect.textContent = "Reconectar cuenta";
    sync.disabled = false;
  } else {
    label.textContent = "Google Calendar aún no está conectado";
    connect.textContent = "Conectar Google Calendar";
    sync.disabled = true;
  }
}
async function refreshDataAfterCalendarSync() {
  const results = await Promise.all([
    authClient.from("care_shifts").select("*").order("weekday").order("start_time"),
    authClient.from("services").select("*").order("starts_at", { ascending: true }),
    authClient.from("service_assignments").select("service_id,caregiver_id").is("ended_at", null)
  ]);
  if (results.some(r => r.error)) return;
  shifts = results[0].data || [];
  const assignments = results[2].data || [];
  services = (results[1].data || []).map(service => Object.assign({}, service, {
    caregiver_id: (assignments.find(a => a.service_id === service.id) || {}).caregiver_id || null
  }));
  renderAll();
}
async function connectGoogleCalendar() {
  const button = $("#connect-google-calendar");
  if (!authClient || !currentUser) {
    toast("Inicia sesión para conectar Google Calendar.", true);
    return;
  }
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Abriendo autorización…";
  try {
    const response = await authClient.functions.invoke("google-calendar-connect", { body: {} });
    if (response.error || !response.data || !response.data.url) {
      toast((response.data && response.data.error) || "No se pudo iniciar la conexión. Comprueba que desplegaste las funciones y configuraste los secretos.", true);
      return;
    }
    window.location.assign(response.data.url);
  } catch (_error) {
    toast("No se pudo iniciar la conexión con Google. Comprueba la configuración de Supabase.", true);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}
async function syncGoogleCalendar() {
  const button = $("#sync-google-calendar");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Sincronizando…";
  const result = await invokeCalendar("sync_all", {});
  if (result.ok) {
    await refreshDataAfterCalendarSync();
    if (result.data.result && result.data.result.partial) {
      toast("Sincronización parcial: se alcanzó el límite de esta pasada. Pulsa sincronizar otra vez.");
    } else if (result.data.result && result.data.result.failed) {
      toast("Sincronización parcial: algunos eventos requieren revisión.", true);
    } else {
      toast("Eventos y avisos sincronizados con Google Calendar.");
    }
  }
  await refreshCalendarStatus();
  button.textContent = original;
  button.disabled = !calendarConnected;
}

async function refreshData() {
  if (!authClient || !currentUser || loadingData) return;
  loadingData = true;
  setTableLoading();
  try {
    const [careResult, clientResult, shiftResult, serviceResult, assignmentResult] = await Promise.all([
      authClient.from("caregivers").select("*").order("created_at", { ascending: false }),
      authClient.from("clients").select("*").order("created_at", { ascending: false }),
      authClient.from("care_shifts").select("*").order("weekday").order("start_time"),
      authClient.from("services").select("*").order("starts_at", { ascending: true }),
      authClient.from("service_assignments").select("service_id,caregiver_id").is("ended_at", null)
    ]);
    const failed = [careResult, clientResult, shiftResult, serviceResult, assignmentResult].find(r => r.error);
    if (failed) {
      console.error("Error al cargar datos de CuidaGest:", failed.error);
      toast("No se han podido cargar los datos. Comprueba las cuatro migraciones en el proyecto de CuidaGest.", true);
      caregivers = [];
      clients = [];
      shifts = [];
      services = [];
    } else {
      caregivers = careResult.data || [];
      clients = clientResult.data || [];
      shifts = shiftResult.data || [];
      const assignments = assignmentResult.data || [];
      services = (serviceResult.data || []).map(service => ({
        ...service,
        caregiver_id: assignments.find(a => a.service_id === service.id)?.caregiver_id || null
      }));
    }
    renderAll();
    await refreshCalendarStatus();
    const url = new URL(window.location.href);
    const calendarResult = url.searchParams.get("calendar");
    if (calendarResult) {
      url.searchParams.delete("calendar");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      if (calendarResult === "connected") {
        toast("Google Calendar conectado. Sincronizando turnos y avisos…");
        const synced = await invokeCalendar("sync_all", {}, true);
        if (synced.ok) {
          await refreshDataAfterCalendarSync();
          toast(synced.data?.result?.failed ? "Conexión realizada, pero algunos eventos requieren revisión." : "Google Calendar se ha sincronizado.");
        } else {
          toast("Google se ha conectado, pero no se han podido sincronizar todos los eventos. Revisa la configuración.", true);
        }
      } else {
        toast(calendarResult === "denied" ? "No se ha concedido acceso a Google Calendar." : "No se pudo completar la conexión con Google Calendar. Revisa la configuración.", true);
      }
    }
  } catch (error) {
    console.error(error);
    toast("Error de conexión al leer la base de datos.", true);
  } finally {
    loadingData = false;
  }
}
function setTableLoading() {
  $("#caregivers-table").innerHTML = '<tr><td colspan="6" class="loading-row">Cargando desde la base de datos…</td></tr>';
  $("#clients-table").innerHTML = '<tr><td colspan="5" class="loading-row">Cargando desde la base de datos…</td></tr>';
  $("#shifts-table").innerHTML = '<tr><td colspan="7" class="loading-row">Cargando desde la base de datos…</td></tr>';
  $("#services-table").innerHTML = '<tr><td colspan="6" class="loading-row">Cargando desde la base de datos…</td></tr>';
}

function renderDashboard() {
  $("#stat-caregivers").textContent = caregivers.length;
  $("#stat-clients").textContent = clients.length;
  $("#stat-shifts").textContent = shifts.filter(s => s.status === "active").length;
  $("#stat-expiring").textContent = caregivers.filter(c => c.nie_expiry_date && c.status !== "inactive" && dayDistance(c.nie_expiry_date) <= 90).length;
  $("#caregiver-nav-count").textContent = caregivers.length;
  $("#client-nav-count").textContent = clients.length;

  const alerts = caregivers.filter(c => c.nie_expiry_date && c.status !== "inactive" && dayDistance(c.nie_expiry_date) <= 90)
    .sort((a, b) => String(a.nie_expiry_date).localeCompare(String(b.nie_expiry_date)));
  $("#expiry-count-tag").textContent = alerts.length + (alerts.length === 1 ? " aviso" : " avisos");
  $("#expiry-alerts").innerHTML = alerts.length ? alerts.map(c => {
    const days = dayDistance(c.nie_expiry_date);
    const label = days < 0 ? "Caducado hace " + Math.abs(days) + " días" : days === 0 ? "Caduca hoy" : "Caduca en " + days + (days === 1 ? " día" : " días");
    const urgency = days < 0 ? "expiry-danger" : days <= 30 ? "expiry-warn" : "expiry-soon";
    return `<article class="alert-row"><span class="alert-symbol ${urgency}">!</span><div class="alert-main"><strong>${safe(fullName(c))}</strong><small>Documento: ${safe(c.identity_document_type || "NIE")} · ${safe(formatDate(c.nie_expiry_date))}</small></div><span class="expiry-label ${urgency}">${safe(label)}</span><button class="icon-button small-icon" data-edit-caregiver="${safe(c.id)}" title="Editar ficha" aria-label="Editar ${safe(fullName(c))}">✎</button></article>`;
  }).join("") : '<div class="empty-message"><span class="empty-check">✓</span><strong>Sin avisos de caducidad</strong><p>No hay documentos vencidos o que caduquen durante los próximos 90 días, o no se ha indicado ninguna fecha.</p></div>';

  const events = getUpcomingEvents(7).slice(0, 7);
  $("#upcoming-shifts").innerHTML = events.length ? events.map(event => {
    const map = mapsUrl(event.client);
    return `<article class="upcoming-row"><div class="upcoming-date"><strong>${safe(event.dateLabel)}</strong><small>${safe(DAY_NAMES[event.shift.weekday])}</small></div><div class="upcoming-detail"><strong>${safe(fullName(event.client))}</strong><small>${safe(formatTime(event.shift.start_time))}–${safe(formatTime(event.shift.end_time))} · ${safe(fullName(event.caregiver))}</small></div>${map ? `<a class="map-link" href="${safe(map)}" target="_blank" rel="noopener noreferrer">Ruta ↗</a>` : '<span class="muted-small">Sin dirección</span>'}</article>`;
  }).join("") : '<div class="empty-message"><strong>No hay turnos próximos</strong><p>Crea una asignación semanal para que aparezca aquí.</p></div>';
}
function getUpcomingEvents(daysToLook = 7) {
  const now = new Date();
  const todayString = todayIso();
  const events = [];
  for (let offset = 0; offset < daysToLook; offset++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12);
    const iso = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
    const weekday = ((date.getDay() + 6) % 7) + 1;
    for (const shift of shifts) {
      if (shift.status !== "active" || Number(shift.weekday) !== weekday) continue;
      if (shift.valid_from && iso < shift.valid_from) continue;
      if (shift.valid_until && iso > shift.valid_until) continue;
      if (offset === 0 && formatTime(shift.start_time) < now.toTimeString().slice(0, 5)) continue;
      const client = clients.find(c => c.id === shift.client_id);
      const caregiver = caregivers.find(c => c.id === shift.caregiver_id);
      if (!client || !caregiver) continue;
      events.push({
        shift, client, caregiver, date: iso,
        dateLabel: offset === 0 && iso === todayString ? "Hoy" : date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })
      });
    }
  }
  return events.sort((a, b) => (a.date + formatTime(a.shift.start_time)).localeCompare(b.date + formatTime(b.shift.start_time)));
}
function renderCaregivers() {
  const query = ($("#caregiver-search")?.value || "").trim().toLocaleLowerCase("es");
  const filter = $("#caregiver-filter")?.value || "all";
  const rows = caregivers.filter(c => {
    const labels = [fullName(c), c.work_area, c.city, c.province, ...(c.tags || [])].join(" ").toLocaleLowerCase("es");
    return labels.includes(query) && (filter === "all" || c.status === filter);
  });
  $("#caregiver-result-count").textContent = rows.length + (rows.length === 1 ? " perfil" : " perfiles");
  $("#caregivers-table").innerHTML = rows.length ? rows.map(c => {
    const expiry = c.nie_expiry_date ? dayDistance(c.nie_expiry_date) : null;
    const expiryClass = expiry !== null && expiry < 0 ? "expiry-danger" : expiry !== null && expiry <= 90 ? "expiry-warn" : "";
    const expiryText = expiry === null ? "Sin fecha" : (expiry < 0 ? "Caducado · " : "") + formatDate(c.nie_expiry_date);
    const tags = (c.tags || []).slice(0, 5).map(t => `<span class="tag-chip">${safe(t)}</span>`).join("") || '<span class="muted-small">Sin etiquetas</span>';
    return `<tr>
      <td>${personMarkup(c, [c.city, c.work_area].filter(Boolean).join(" · "))}</td>
      <td><select class="inline-status" data-caregiver-status="${safe(c.id)}" aria-label="Estado de ${safe(fullName(c))}">${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${c.status === key ? "selected" : ""}>${safe(label)}</option>`).join("")}</select></td>
      <td>${safe(c.work_area || c.city || "—")}</td>
      <td><span class="${expiryClass}">${safe(expiryText)}</span></td>
      <td><div class="tag-list">${tags}${(c.tags || []).length > 5 ? `<span class="muted-small">+${c.tags.length - 5}</span>` : ""}</div></td>
      <td><button class="button button-outline button-small" data-edit-caregiver="${safe(c.id)}">Editar</button></td>
    </tr>`;
  }).join("") : '<tr><td colspan="6" class="empty-row">No hay cuidadoras guardadas que coincidan. Usa «Nueva cuidadora» para crear la primera ficha.</td></tr>';
}
function renderClients() {
  const query = ($("#client-search")?.value || "").trim().toLocaleLowerCase("es");
  const rows = clients.filter(c => [fullName(c), c.service_address, c.postal_code, c.service_area, c.province, c.support_type].join(" ").toLocaleLowerCase("es").includes(query));
  $("#client-result-count").textContent = rows.length + (rows.length === 1 ? " persona" : " personas");
  $("#clients-table").innerHTML = rows.length ? rows.map(c => {
    const address = [c.service_address, c.postal_code, c.service_area, c.province].filter(Boolean).join(", ");
    const map = mapsUrl(c);
    return `<tr><td>${personMarkup(c, c.contact_phone || "Sin teléfono")}</td><td>${safe(c.support_type || "Sin especificar")}</td><td><span class="address-cell">${safe(address || "Sin dirección")}</span></td><td>${statusChip(c.status, true)}</td><td class="actions-cell">${map ? `<a class="button button-outline button-small" href="${safe(map)}" target="_blank" rel="noopener noreferrer">Abrir mapa ↗</a>` : ""}<button class="button button-outline button-small" data-edit-client="${safe(c.id)}">Editar</button></td></tr>`;
  }).join("") : '<tr><td colspan="5" class="empty-row">No hay personas registradas que coincidan. Usa «Nueva ficha» para crear la primera.</td></tr>';
}
function renderShifts() {
  const query = ($("#shift-search")?.value || "").trim().toLocaleLowerCase("es");
  const filter = $("#shift-filter")?.value || "active";
  const rows = shifts.filter(s => {
    const caregiver = caregivers.find(c => c.id === s.caregiver_id);
    const client = clients.find(c => c.id === s.client_id);
    const searchable = [fullName(caregiver), fullName(client), DAY_NAMES[s.weekday], s.service_type, client?.service_address, client?.service_area].join(" ").toLocaleLowerCase("es");
    return searchable.includes(query) && (filter === "all" || s.status === filter);
  }).sort((a, b) => Number(a.weekday) - Number(b.weekday) || String(a.start_time).localeCompare(String(b.start_time)));
  $("#shift-result-count").textContent = rows.length + (rows.length === 1 ? " turno" : " turnos");
  $("#shifts-table").innerHTML = rows.length ? rows.map(s => {
    const caregiver = caregivers.find(c => c.id === s.caregiver_id);
    const client = clients.find(c => c.id === s.client_id);
    const map = mapsUrl(client);
    return `<tr>
      <td><strong>${safe(DAY_NAMES[s.weekday])}</strong><div class="person-sub">${safe(s.service_type)}</div></td>
      <td class="time-cell">${safe(formatTime(s.start_time))}–${safe(formatTime(s.end_time))}</td>
      <td>${caregiver ? personMarkup(caregiver) : "Cuidadora no encontrada"}</td>
      <td>${client ? personMarkup(client) : "Persona no encontrada"}</td>
      <td>${safe(formatDate(s.valid_from))}<div class="person-sub">${s.valid_until ? "Hasta " + safe(formatDate(s.valid_until)) : "Sin fecha final"}</div></td>
      <td>${statusChip(s.status === "active" ? "active" : "paused", true)}</td>
      <td class="actions-cell">${map ? `<a class="button button-outline button-small" href="${safe(map)}" target="_blank" rel="noopener noreferrer">Ruta ↗</a>` : ""}<button class="button button-outline button-small" data-toggle-shift="${safe(s.id)}" data-next-status="${s.status === "active" ? "paused" : "active"}">${s.status === "active" ? "Pausar" : "Reactivar"}</button></td>
    </tr>`;
  }).join("") : '<tr><td colspan="7" class="empty-row">No hay turnos para mostrar. Crea una asignación con el botón «Nuevo turno».</td></tr>';
}
function renderDashboardOnly() { renderDashboard(); }
function renderAll() {
  renderDashboard();
  renderCaregivers();
  renderClients();
  renderShifts();
  fillShiftSelects();
}
function setModalFields(type) {
  ["caregiver", "client", "shift"].forEach(name => {
    const box = $("#" + name + "-fields");
    box.hidden = name !== type;
    box.querySelectorAll("input,select,textarea").forEach(control => { control.disabled = name !== type; });
  });
}
function resetModal(type, record = null) {
  modalType = type;
  editingId = record?.id || null;
  $("#record-form").reset();
  $("#record-id").value = editingId || "";
  const title = { caregiver: "Cuidadora", client: "persona atendida", shift: "turno recurrente" }[type];
  $("#modal-title").textContent = (editingId ? "Editar " : "Nueva ") + title;
  $("#modal-intro").textContent = type === "caregiver"
    ? "Completa los datos profesionales. Guarda solo la información necesaria; no introduzcas el número completo del NIE."
    : type === "client"
      ? "Registra los datos operativos y la dirección exacta a la que deberá acudir la cuidadora."
      : "Elige cuidadora, persona, días y franja horaria. Cada día seleccionado se guardará como un turno recurrente.";
  setModalFields(type);
  fillShiftSelects();

  if (type === "caregiver" && record) {
    const fields = {
      "cg-first-name": record.first_name || record.full_name || "",
      "cg-last-name": record.last_name || "", "cg-second-last-name": record.second_last_name || "",
      "cg-birth-date": dateForInput(record.birth_date), "cg-phone": record.phone, "cg-email": record.email,
      "cg-nationality": record.nationality, "cg-doc-type": record.identity_document_type || "NIE",
      "cg-nie-expiry": dateForInput(record.nie_expiry_date), "cg-address": record.home_address,
      "cg-city": record.city, "cg-province": record.province, "cg-postal": record.postal_code,
      "cg-zone": record.work_area, "cg-availability": record.availability_summary,
      "cg-experience": record.experience_summary, "cg-training": record.training_summary,
      "cg-languages": (record.languages || []).join(", "), "cg-support-types": (record.preferred_support_types || []).join(", "),
      "cg-status": record.status, "cg-tags": (record.tags || []).join(", "), "cg-notes": record.internal_notes || record.review_notes
    };
    Object.entries(fields).forEach(([id, value]) => { const el = $("#" + id); if (el) el.value = value ?? ""; });
  } else if (type === "client" && record) {
    const fields = {
      "cl-first-name": record.first_name || record.full_name || "", "cl-last-name": record.last_name,
      "cl-second-last-name": record.second_last_name, "cl-phone": record.contact_phone,
      "cl-address": record.service_address, "cl-postal": record.postal_code,
      "cl-city": record.service_area, "cl-province": record.province, "cl-support": record.support_type,
      "cl-status": record.status, "cl-access": record.access_instructions,
      "cl-requirements": record.care_requirements, "cl-notes": record.coordination_notes
    };
    Object.entries(fields).forEach(([id, value]) => { const el = $("#" + id); if (el) el.value = value ?? ""; });
  } else if (type === "shift") {
    $("#sh-from").value = todayIso();
    $$("#shift-fields input[name='weekday']").forEach(box => { box.checked = false; });
  }
  $("#record-submit").textContent = editingId ? "Guardar cambios" : (type === "caregiver" ? "Guardar cuidadora" : type === "client" ? "Guardar ficha" : "Guardar turnos");
  $("#modal-backdrop").hidden = false;
  $(".modal").scrollTop = 0;
}
function closeModal() { $("#modal-backdrop").hidden = true; }
function fillShiftSelects() {
  const caregiverSel = $("#sh-caregiver");
  const clientSel = $("#sh-client");
  if (!caregiverSel || !clientSel) return;
  const previousCare = caregiverSel.value, previousClient = clientSel.value;
  caregiverSel.innerHTML = '<option value="">Selecciona cuidadora apta</option>' + caregivers.filter(c => c.status === "approved").map(c => `<option value="${safe(c.id)}">${safe(fullName(c))}${c.work_area ? " · " + safe(c.work_area) : ""}</option>`).join("");
  clientSel.innerHTML = '<option value="">Selecciona persona atendida</option>' + clients.filter(c => c.status === "active").map(c => `<option value="${safe(c.id)}">${safe(fullName(c))}${c.service_area ? " · " + safe(c.service_area) : ""}</option>`).join("");
  if (previousCare && [...caregiverSel.options].some(o => o.value === previousCare)) caregiverSel.value = previousCare;
  if (previousClient && [...clientSel.options].some(o => o.value === previousClient)) clientSel.value = previousClient;
}
function formValue(id) { return $("#" + id).value.trim(); }
function validateShiftForm() {
  const weekdays = $$("#shift-fields input[name='weekday']:checked").map(input => Number(input.value));
  if (!weekdays.length) { toast("Selecciona al menos un día de la semana.", true); return null; }
  if ($("#sh-end").value <= $("#sh-start").value) { toast("La hora de fin debe ser posterior a la hora de inicio.", true); return null; }
  if ($("#sh-until").value && $("#sh-until").value < $("#sh-from").value) { toast("La fecha final no puede ser anterior a la fecha de inicio.", true); return null; }
  return weekdays;
}
async function saveRecord(event) {
  event.preventDefault();
  if (!authClient || !currentUser) return;
  const button = $("#record-submit");
  button.disabled = true;
  const oldText = button.textContent;
  button.textContent = "Guardando…";
  try {
    let result;
    if (modalType === "caregiver") {
      const first = formValue("cg-first-name");
      const last = formValue("cg-last-name");
      if (!first || !last) throw new Error("Completa el nombre y el primer apellido.");
      const values = {
        first_name: first, last_name: last, second_last_name: formValue("cg-second-last-name") || null,
        full_name: [first, last, formValue("cg-second-last-name")].filter(Boolean).join(" "),
        birth_date: formValue("cg-birth-date") || null, phone: formValue("cg-phone") || null,
        email: formValue("cg-email") || null, nationality: formValue("cg-nationality") || null,
        identity_document_type: $("#cg-doc-type").value, nie_expiry_date: formValue("cg-nie-expiry") || null,
        home_address: formValue("cg-address") || null, city: formValue("cg-city") || null,
        province: formValue("cg-province") || null, postal_code: formValue("cg-postal") || null,
        work_area: formValue("cg-zone") || null, availability_summary: formValue("cg-availability") || null,
        experience_summary: formValue("cg-experience") || null, training_summary: formValue("cg-training") || null,
        languages: parseList(formValue("cg-languages")), preferred_support_types: parseList(formValue("cg-support-types")),
        status: $("#cg-status").value, tags: parseList(formValue("cg-tags")), internal_notes: formValue("cg-notes") || null,
        created_by: currentUser.id
      };
      result = editingId
        ? await authClient.from("caregivers").update(values).eq("id", editingId).select("id").single()
        : await authClient.from("caregivers").insert(values).select("id").single();
    } else if (modalType === "client") {
      const first = formValue("cl-first-name");
      const last = formValue("cl-last-name");
      const address = formValue("cl-address");
      const city = formValue("cl-city");
      if (!first || !last || !address || !city) throw new Error("Completa nombre, apellido, dirección y localidad.");
      const values = {
        first_name: first, last_name: last, second_last_name: formValue("cl-second-last-name") || null,
        full_name: [first, last, formValue("cl-second-last-name")].filter(Boolean).join(" "),
        contact_phone: formValue("cl-phone") || null, service_address: address,
        postal_code: formValue("cl-postal") || null, service_area: city,
        province: formValue("cl-province") || null, support_type: $("#cl-support").value,
        status: $("#cl-status").value, access_instructions: formValue("cl-access") || null,
        care_requirements: formValue("cl-requirements") || null,
        coordination_notes: formValue("cl-notes") || null, created_by: currentUser.id
      };
      result = editingId
        ? await authClient.from("clients").update(values).eq("id", editingId).select("id").single()
        : await authClient.from("clients").insert(values).select("id").single();
    } else if (modalType === "shift") {
      if (editingId) throw new Error("La edición directa de un turno no está habilitada; pausa el turno y crea otro.");
      const weekdays = validateShiftForm();
      if (!weekdays) return;
      if (!$("#sh-caregiver").value || !$("#sh-client").value) throw new Error("Selecciona una cuidadora apta y una persona atendida activa.");
      const values = weekdays.map(day => ({
        caregiver_id: $("#sh-caregiver").value, client_id: $("#sh-client").value, weekday: day,
        start_time: $("#sh-start").value, end_time: $("#sh-end").value,
        service_type: formValue("sh-type") || "Atención domiciliaria",
        valid_from: $("#sh-from").value, valid_until: $("#sh-until").value || null,
        status: "active", notes: formValue("sh-notes") || null, created_by: currentUser.id
      }));
      result = await authClient.from("care_shifts").insert(values).select("id");
    }
    if (result?.error) {
      if (result.error.code === "23P01" || /solapa|overlap/i.test(result.error.message || "")) {
        throw new Error("Ese horario se solapa con otro turno de la cuidadora o de la persona atendida. Revisa el día y las horas.");
      }
      if (result.error.code === "23505") throw new Error("Ya existe una asignación duplicada. Comprueba los turnos.");
      console.error("Error guardando:", result.error);
      throw new Error("No se pudo guardar. Comprueba que ejecutaste la migración 003 y que los permisos están configurados.");
    }
    closeModal();
    await refreshData();
    showView(modalType === "caregiver" ? "caregivers" : modalType === "client" ? "clients" : "shifts");
    toast(editingId ? "Cambios guardados en Supabase." : (modalType === "shift" ? "Turnos guardados en Supabase." : "Ficha guardada en Supabase."));
  } catch (error) {
    console.error(error);
    toast(error.message || "No se pudo guardar el registro.", true);
  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
}
async function changeCaregiverStatus(id, status) {
  const result = await authClient.from("caregivers").update({ status }).eq("id", id);
  if (result.error) { toast("No se pudo actualizar el estado.", true); await refreshData(); return; }
  toast("Estado de candidatura actualizado.");
  await refreshData();
}
async function toggleShift(id, status) {
  const result = await authClient.from("care_shifts").update({ status }).eq("id", id);
  if (result.error) { toast("No se pudo modificar el turno.", true); return; }
  toast(status === "paused" ? "Turno pausado. Su historial se conserva." : "Turno reactivado.");
  await refreshData();
}
async function logout() {
  if (!authClient) return;
  const { error } = await authClient.auth.signOut({ scope: "local" });
  if (error) { toast("No se ha podido cerrar sesión.", true); return; }
  currentUser = null;
  caregivers = []; clients = []; shifts = [];
  showLogin("Has cerrado la sesión.");
  $("#login-password").value = "";
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-view]");
  const viewLink = event.target.closest("[data-view-link]");
  const open = event.target.closest("[data-open-modal]");
  const editCaregiver = event.target.closest("[data-edit-caregiver]");
  const editClient = event.target.closest("[data-edit-client]");
  const toggle = event.target.closest("[data-toggle-shift]");
  if (nav) showView(nav.dataset.view);
  if (viewLink) showView(viewLink.dataset.viewLink);
  if (open) resetModal(open.dataset.openModal);
  if (editCaregiver) resetModal("caregiver", caregivers.find(c => c.id === editCaregiver.dataset.editCaregiver));
  if (editClient) resetModal("client", clients.find(c => c.id === editClient.dataset.editClient));
  if (toggle) void toggleShift(toggle.dataset.toggleShift, toggle.dataset.nextStatus);
  if (event.target.closest("#close-modal, #cancel-modal, [data-cancel-modal]")) closeModal();
  if (event.target === $("#modal-backdrop")) closeModal();
  if (event.target.closest("#mobile-menu")) $("#sidebar").classList.toggle("open");
  if (event.target.closest("#logout-button")) void logout();
});
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!authClient) { setAuthMessage("La conexión con Supabase todavía no está configurada."); return; }
  setAuthMessage("");
  setLoginBusy(true);
  try {
    const { data, error } = await authClient.auth.signInWithPassword({
      email: $("#login-email").value.trim(), password: $("#login-password").value
    });
    setLoginBusy(false);
    if (error) setAuthMessage("No se ha podido iniciar sesión. Comprueba el correo y la contraseña.");
    else await verifySession(data.session, true);
  } catch (_error) {
    setLoginBusy(false);
    setAuthMessage("Error de conexión. Comprueba Internet e inténtalo de nuevo.");
  }
});
$("#record-form").addEventListener("submit", saveRecord);
$("#caregiver-search").addEventListener("input", renderCaregivers);
$("#caregiver-filter").addEventListener("change", renderCaregivers);
$("#client-search").addEventListener("input", renderClients);
$("#shift-search").addEventListener("input", renderShifts);
$("#shift-filter").addEventListener("change", renderShifts);
$("#caregivers-table").addEventListener("change", (event) => {
  const select = event.target.closest("[data-caregiver-status]");
  if (select) void changeCaregiverStatus(select.dataset.caregiverStatus, select.value);
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });

// Evitar que los enlaces de la marca provoquen navegación arriba en localhost o GitHub Pages.
$$(".brand").forEach(link => link.addEventListener("click", event => event.preventDefault()));
initializeAuth();
