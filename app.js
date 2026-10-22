// CuidaGest — prototipo de interfaz.
// IMPORTANTE: estos datos son ficticios y solo viven en la memoria de esta pestaña.
// No usar para guardar información real ni datos personales.

const caregivers = [
  { id: 1, name: "Alex Romero", initials: "AR", zone: "Centro", experience: "2–5 años", availability: "Mañanas", status: "Apto", color: "" },
  { id: 2, name: "Lucía Martín", initials: "LM", zone: "Norte", experience: "Más de 5 años", availability: "Mañanas y tardes", status: "Apto", color: "alt1" },
  { id: 3, name: "Daniel Vega", initials: "DV", zone: "Sur", experience: "Menos de 2 años", availability: "Tardes", status: "En valoración", color: "alt2" },
  { id: 4, name: "Sara Navarro", initials: "SN", zone: "Centro", experience: "2–5 años", availability: "Flexible", status: "Apto", color: "alt3" },
  { id: 5, name: "Noa Castillo", initials: "NC", zone: "Este", experience: "Más de 5 años", availability: "Noches", status: "En valoración", color: "alt1" },
  { id: 6, name: "Mario Gil", initials: "MG", zone: "Norte", experience: "2–5 años", availability: "Mañanas", status: "Apto", color: "alt2" }
];

const clients = [
  { id: 1, name: "Patricia Demo", initials: "PD", support: "Apoyo personal", frequency: "L–V · mañanas", assigned: "Lucía Martín", status: "Servicio activo", color: "" },
  { id: 2, name: "Antonio Ejemplo", initials: "AE", support: "Acompañamiento", frequency: "L, X, V", assigned: "Alex Romero", status: "Servicio activo", color: "alt1" },
  { id: 3, name: "Carmen Prueba", initials: "CP", support: "Apoyo doméstico", frequency: "M–J · tardes", assigned: "Sara Navarro", status: "Servicio activo", color: "alt2" },
  { id: 4, name: "José Ficticio", initials: "JF", support: "Atención por horas", frequency: "A convenir", assigned: "Sin asignar", status: "Pendiente", color: "alt3" }
];

const todayServices = [
  { time: "09:00", client: "Patricia Demo", caregiver: "Lucía Martín", service: "Apoyo personal", status: "Programado" },
  { time: "10:30", client: "Antonio Ejemplo", caregiver: "Alex Romero", service: "Acompañamiento", status: "Programado" },
  { time: "12:00", client: "Carmen Prueba", caregiver: "Sara Navarro", service: "Apoyo doméstico", status: "Programado" },
  { time: "16:00", client: "José Ficticio", caregiver: "Sin asignar", service: "Por definir", status: "Pendiente" }
];

const calendarServices = [
  { day: "Lunes", date: "Día de ejemplo", time: "09:00–11:00", client: "Patricia Demo", caregiver: "Lucía Martín", service: "Apoyo personal", kind: "mint" },
  { day: "Lunes", date: "Día de ejemplo", time: "11:30–12:30", client: "Antonio Ejemplo", caregiver: "Alex Romero", service: "Acompañamiento", kind: "blue" },
  { day: "Martes", date: "Día de ejemplo", time: "16:00–18:00", client: "Carmen Prueba", caregiver: "Sara Navarro", service: "Apoyo doméstico", kind: "lilac" },
  { day: "Miércoles", date: "Día de ejemplo", time: "09:00–11:00", client: "Patricia Demo", caregiver: "Lucía Martín", service: "Apoyo personal", kind: "mint" },
  { day: "Viernes", date: "Día de ejemplo", time: "10:30–12:00", client: "Antonio Ejemplo", caregiver: "Alex Romero", service: "Acompañamiento", kind: "blue" }
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const statusClass = (status) => status === "Apto" ? "chip-approved" : status === "No apto" ? "chip-rejected" : "chip-review";
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const initialsFor = (name) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || "").join("");
const avatarClass = (item) => item.color ? "person-avatar " + item.color : "person-avatar";

function personMarkup(name, initials, subtitle = "", color = "") {
  return `<div class="person-cell"><span class="${avatarClass({ color })}">${safe(initials || initialsFor(name))}</span><span>${safe(name)}${subtitle ? `<span class="person-sub">${safe(subtitle)}</span>` : ""}</span></div>`;
}

function renderToday() {
  $("#today-table").innerHTML = todayServices.map(item => `
    <tr><td class="time-cell">${safe(item.time)}</td><td>${personMarkup(item.client, initialsFor(item.client))}</td><td>${safe(item.caregiver)}</td><td>${safe(item.service)}</td><td><span class="status-chip ${item.status === "Pendiente" ? "chip-review" : "chip-planned"}">${safe(item.status)}</span></td></tr>
  `).join("");
}

function renderCaregivers() {
  const query = ($("#caregiver-search")?.value || "").trim().toLocaleLowerCase("es");
  const filter = $("#caregiver-filter")?.value || "all";
  const shown = caregivers.filter(item => (item.name + " " + item.zone).toLocaleLowerCase("es").includes(query) && (filter === "all" || item.status === filter));
  $("#caregivers-table").innerHTML = shown.length ? shown.map(item => `
    <tr><td>${personMarkup(item.name, item.initials, "Perfil de demostración", item.color)}</td><td>${safe(item.zone || "Sin especificar")}</td><td>${safe(item.experience)}</td><td>${safe(item.availability || "Por confirmar")}</td><td><span class="soft-tag">Pendiente de ficha completa</span></td><td><select class="inline-status" data-caregiver-status="${item.id}" aria-label="Estado de ${safe(item.name)}"><option ${item.status === "En valoración" ? "selected" : ""}>En valoración</option><option ${item.status === "Apto" ? "selected" : ""}>Apto</option><option ${item.status === "No apto" ? "selected" : ""}>No apto</option></select></td></tr>
  `).join("") : '<tr><td colspan="6" class="empty-row">No hay perfiles que coincidan con la búsqueda.</td></tr>';
  $("#caregiver-result-count").textContent = `${shown.length} ${shown.length === 1 ? "perfil" : "perfiles"}`;
}

function renderClients() {
  const query = ($("#client-search")?.value || "").trim().toLocaleLowerCase("es");
  const shown = clients.filter(item => (item.name + " " + item.support + " " + item.assigned).toLocaleLowerCase("es").includes(query));
  $("#clients-table").innerHTML = shown.length ? shown.map(item => `
    <tr><td>${personMarkup(item.name, item.initials, "Ficha ficticia", item.color)}</td><td>${safe(item.support)}</td><td>${safe(item.frequency)}</td><td>${safe(item.assigned)}</td><td><span class="status-chip ${item.status === "Pendiente" ? "chip-review" : "chip-active"}">${safe(item.status)}</span></td></tr>
  `).join("") : '<tr><td colspan="5" class="empty-row">No hay usuarios que coincidan con la búsqueda.</td></tr>';
  $("#client-result-count").textContent = `${shown.length} ${shown.length === 1 ? "usuario" : "usuarios"}`;
}

function renderCalendar() {
  const grouped = calendarServices.reduce((groups, event) => {
    (groups[event.day] ||= []).push(event);
    return groups;
  }, {});
  $("#calendar-list").innerHTML = Object.entries(grouped).map(([day, events]) => `
    <div class="calendar-day"><div class="calendar-day-title"><span>${safe(day)}</span><small>${events.length} ${events.length === 1 ? "servicio de ejemplo" : "servicios de ejemplo"}</small></div>
    ${events.map(event => `<div class="calendar-event"><div class="event-time">${safe(event.time)}</div><div class="event-bar ${event.kind === "blue" ? "blue-event" : event.kind === "lilac" ? "lilac-event" : ""}"></div><div><div class="event-title">${safe(event.client)} · ${safe(event.service)}</div><div class="event-detail">Cuidador/a: ${safe(event.caregiver)}</div></div><span class="event-label">Demo</span></div>`).join("")}
    </div>`).join("");
}

function renderStats() {
  const approved = caregivers.filter(item => item.status === "Apto").length;
  const review = caregivers.filter(item => item.status === "En valoración").length;
  const rejected = caregivers.filter(item => item.status === "No apto").length;
  const total = caregivers.length || 1;
  $("#stat-caregivers").textContent = caregivers.length;
  $("#caregiver-nav-count").textContent = caregivers.length;
  $("#client-nav-count").textContent = clients.length;
  $("#stat-clients").textContent = clients.length;
  $("#stat-approved").textContent = `${approved} aptos`;
  $("#stat-pending").textContent = review;
  $("#selection-total").textContent = caregivers.length;
  $("#progress-approved").textContent = approved;
  $("#progress-review").textContent = review;
  $("#progress-rejected").textContent = rejected;
  $("#bar-approved").style.width = (approved / total * 100) + "%";
  $("#bar-review").style.width = (review / total * 100) + "%";
  $("#bar-rejected").style.width = (rejected / total * 100) + "%";
}

const viewNames = { dashboard: "Panel general", caregivers: "Cuidadores", clients: "Usuarios del servicio", calendar: "Agenda y servicios" };
function showView(name) {
  if (!viewNames[name]) return;
  $$(".view").forEach(view => view.classList.toggle("active", view.id === `view-${name}`));
  $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === name));
  $("#breadcrumb-title").textContent = viewNames[name];
  $("#sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

let modalType = "caregiver";
function openModal(type) {
  modalType = type;
  $("#record-form").reset();
  $("#record-type").value = type;
  const isCaregiver = type === "caregiver";
  $("#modal-title").textContent = isCaregiver ? "Añadir cuidador" : "Añadir usuario del servicio";
  $("#modal-intro").textContent = isCaregiver ? "Añade un perfil ficticio para probar la interfaz. No uses datos personales reales." : "Añade una ficha ficticia para probar la interfaz. No incluyas datos personales ni información de salud real.";
  $("#caregiver-fields").hidden = !isCaregiver;
  $("#client-fields").hidden = isCaregiver;
  const select = $("#record-assigned");
  select.innerHTML = '<option>Sin asignar</option>' + caregivers.filter(item => item.status === "Apto").map(item => `<option>${safe(item.name)}</option>`).join("");
  $("#modal-backdrop").hidden = false;
  $("#record-name").focus();
}
function closeModal() { $("#modal-backdrop").hidden = true; }
let toastTimer;
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2800);
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-view]");
  const viewLink = event.target.closest("[data-view-link]");
  const open = event.target.closest("[data-open-modal]");
  if (nav) showView(nav.dataset.view);
  if (viewLink) showView(viewLink.dataset.viewLink);
  if (open) openModal(open.dataset.openModal);
  if (event.target.closest("#close-modal, #cancel-modal")) closeModal();
  if (event.target === $("#modal-backdrop")) closeModal();
  if (event.target.closest("#mobile-menu")) $("#sidebar").classList.toggle("open");
  if (event.target.closest("#calendar-info-button")) toast("El alta de servicios se habilitará al crear la base de datos segura.");
});

$("#caregiver-search").addEventListener("input", renderCaregivers);
$("#caregiver-filter").addEventListener("change", renderCaregivers);
$("#client-search").addEventListener("input", renderClients);
$("#caregivers-table").addEventListener("change", (event) => {
  const select = event.target.closest("[data-caregiver-status]");
  if (!select) return;
  const caregiver = caregivers.find(item => item.id === Number(select.dataset.caregiverStatus));
  if (!caregiver) return;
  caregiver.status = select.value;
  renderCaregivers();
  renderStats();
  toast(`Estado de ${caregiver.name} actualizado en la demo.`);
});

$("#record-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#record-name").value.trim();
  if (!name) return;
  if (modalType === "caregiver") {
    caregivers.unshift({
      id: Date.now(), name, initials: initialsFor(name),
      zone: $("#record-zone").value.trim() || "Sin especificar",
      experience: $("#record-experience").value,
      availability: "Por confirmar",
      status: $("#record-status").value,
      color: ["", "alt1", "alt2", "alt3"][caregivers.length % 4]
    });
    renderCaregivers();
    renderStats();
    closeModal();
    showView("caregivers");
    toast("Perfil de ejemplo añadido. Se borrará al recargar.");
  } else {
    clients.unshift({
      id: Date.now(), name, initials: initialsFor(name),
      support: $("#record-support").value, frequency: "Por definir",
      assigned: $("#record-assigned").value, status: "Pendiente", color: "alt2"
    });
    renderClients();
    renderStats();
    closeModal();
    showView("clients");
    toast("Ficha de ejemplo añadida. Se borrará al recargar.");
  }
});

document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });

// --- Autenticación de CuidaGest ---
// La sesión se conserva en sessionStorage: normalmente se vuelve a pedir inicio
// de sesión al cerrar la pestaña. La seguridad real la aplican Supabase Auth y RLS.
const authForm = $("#login-form");
const authMessage = $("#login-message");
const authStatus = $("#login-config-status");
const authSubmit = $("#login-submit");
const loginShell = $("#login-shell");
const appShell = $("#app-shell");
let authClient = null;
let demoUiInitialized = false;
let authEventSequence = 0;

function setAuthMessage(message = "") {
  authMessage.textContent = message;
  authMessage.classList.toggle("visible", Boolean(message));
}

function showLogin(message = "") {
  appShell.hidden = true;
  loginShell.hidden = false;
  if (message) setAuthMessage(message);
}

function setLoginBusy(isBusy) {
  authSubmit.disabled = isBusy || !authClient;
  authSubmit.textContent = isBusy ? "Comprobando acceso…" : "Iniciar sesión →";
}

function initializeDemoUi() {
  if (demoUiInitialized) return;
  demoUiInitialized = true;
  renderToday();
  renderCaregivers();
  renderClients();
  renderCalendar();
  renderStats();
}

async function verifyAndShowApp(session) {
  if (!session?.user?.id) {
    showLogin();
    return;
  }

  authStatus.textContent = "Verificando permisos de la cuenta…";
  const { data: profile, error } = await authClient
    .from("staff_profiles")
    .select("display_name, role, is_active")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error || !profile || profile.role !== "admin" || profile.is_active !== true) {
    await authClient.auth.signOut({ scope: "local" });
    authStatus.textContent = "La cuenta debe estar autorizada en Supabase.";
    showLogin("Esta cuenta no tiene acceso autorizado a CuidaGest. Comprueba su perfil en Supabase.");
    return;
  }

  setAuthMessage("");
  authStatus.textContent = "Sesión verificada";
  $("#signed-in-name").textContent = profile.display_name || "Administradora";
  $("#signed-in-email").textContent = session.user.email || "Cuenta autorizada";
  $("#topbar-avatar").textContent = initialsFor(profile.display_name || session.user.email || "AD");
  $("#sidebar-avatar").textContent = initialsFor(profile.display_name || session.user.email || "AD");
  loginShell.hidden = true;
  appShell.hidden = false;
  initializeDemoUi();
}

async function initializeAuthentication() {
  const config = window.CUIDAGEST_CONFIG || {};
  const url = String(config.supabaseUrl || "").trim();
  const publicKey = String(config.supabasePublishableKey || "").trim();

  if (!window.supabase?.createClient) {
    authStatus.textContent = "No se ha podido cargar la biblioteca de autenticación. Comprueba la conexión a Internet.";
    setLoginBusy(true);
    return;
  }
  if (!url || !publicKey) {
    authStatus.textContent = "Pendiente: añade la URL y la clave pública del proyecto en supabase-config.js.";
    setAuthMessage("La pantalla de acceso está preparada, pero falta conectar el proyecto de Supabase.");
    setLoginBusy(true);
    return;
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
    authStatus.textContent = "La URL configurada no parece una URL válida de proyecto Supabase.";
    setAuthMessage("Revisa la URL del proyecto en supabase-config.js.");
    setLoginBusy(true);
    return;
  }

  try {
    authClient = window.supabase.createClient(url.replace(/\/$/, ""), publicKey, {
      auth: {
        storage: window.sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    setLoginBusy(false);
    authStatus.textContent = "Conectando con la cuenta autorizada…";

    authClient.auth.onAuthStateChange((_event, session) => {
      const eventId = ++authEventSequence;
      // No hacer llamadas Supabase dentro del callback síncrono de auth.
      window.setTimeout(() => {
        if (eventId === authEventSequence) void verifyAndShowApp(session);
      }, 0);
    });

    const { data, error } = await authClient.auth.getSession();
    if (error) {
      showLogin("No se pudo comprobar la sesión. Inténtalo de nuevo.");
      authStatus.textContent = "No se pudo comprobar la sesión.";
      return;
    }
    await verifyAndShowApp(data.session);
  } catch (_error) {
    authStatus.textContent = "No se ha podido conectar con Supabase.";
    setAuthMessage("No se ha podido conectar. Comprueba la URL y la clave pública configuradas.");
    setLoginBusy(true);
  }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!authClient) {
    setAuthMessage("La conexión con Supabase todavía no está configurada.");
    return;
  }

  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  setAuthMessage("");
  setLoginBusy(true);

  try {
    const { error } = await authClient.auth.signInWithPassword({ email, password });
    setLoginBusy(false);
    if (error) setAuthMessage("No se ha podido iniciar sesión. Comprueba el correo y la contraseña.");
  } catch (_error) {
    setLoginBusy(false);
    setAuthMessage("No se ha podido conectar. Comprueba tu conexión a Internet e inténtalo de nuevo.");
  }
});

$("#logout-button").addEventListener("click", async () => {
  if (!authClient) return;
  const { error } = await authClient.auth.signOut({ scope: "local" });
  if (error) {
    toast("No se ha podido cerrar la sesión. Inténtalo otra vez.");
    return;
  }
  showLogin("Has cerrado la sesión correctamente.");
  $("#login-password").value = "";
});

initializeAuthentication();