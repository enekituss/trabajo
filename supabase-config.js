// Configuración pública del cliente web de CuidaGest.
// Rellena únicamente con los valores del PROYECTO NUEVO de Supabase.
// La URL y la publishable/anon key están diseñadas para el navegador.
// NUNCA pegues aquí service_role, secret keys, contraseñas ni tokens privados.
window.CUIDAGEST_CONFIG = {
  supabaseUrl: "https://kvbnczvxgxkaquenszbr.supabase.co",
  supabasePublishableKey: "sb_publishable_Sx4NElg6q1tiSsDt4jJFlQ_n5e9OWjp"
};

// Campo adicional de documentación de cuidadoras.
// Se mantiene aquí para no tener que sustituir index.html/app.js completos y
// permite añadir el DNI/NIE sin tocar ni borrar las fichas existentes.
(() => {
  const documentNumbers = new Map();
  let caregiverSaveInProgress = false;
  let originalFetch = window.fetch.bind(window);

  function ensureDocumentField() {
    if (document.getElementById("cg-doc-number")) return;
    const docType = document.getElementById("cg-doc-type");
    if (!docType) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = '<label class="field-label" for="cg-doc-number">Número de DNI/NIE</label><input class="form-input" id="cg-doc-number" maxlength="20" autocomplete="off" placeholder="Ej.: 12345678Z o X1234567L">';
    docType.closest("div")?.insertAdjacentElement("afterend", wrapper.firstElementChild?.parentElement || wrapper);
  }

  function setDocumentFromRecord(id) {
    const input = document.getElementById("cg-doc-number");
    if (!input) return;
    input.value = documentNumbers.get(id) || "";
  }

  window.fetch = async (...args) => {
    const request = args[0];
    const init = args[1] || {};
    const url = typeof request === "string" ? request : request?.url || "";
    const method = String(init.method || (request?.method || "GET")).toUpperCase();
    const isCaregiverEndpoint = String(url).includes("/rest/v1/caregivers");

    if (isCaregiverEndpoint && caregiverSaveInProgress && (method === "POST" || method === "PATCH")) {
      try {
        const headers = new Headers(init.headers || (request?.headers || undefined));
        const rawBody = init.body ?? (request instanceof Request ? await request.clone().text() : null);
        if (rawBody) {
          const parsed = JSON.parse(rawBody);
          const value = document.getElementById("cg-doc-number")?.value?.trim() || null;
          if (Array.isArray(parsed)) parsed.forEach(row => { row.identity_document_number = value; });
          else parsed.identity_document_number = value;
          init = { ...init, method, headers, body: JSON.stringify(parsed) };
          if (request instanceof Request) args[0] = new Request(request, init);
          else args[1] = init;
        }
      } catch (error) {
        console.warn("No se pudo añadir el número de DNI/NIE a la petición.", error);
      }
    }

    const response = await originalFetch(...args);
    if (isCaregiverEndpoint && method === "GET") {
      try {
        const clone = response.clone();
        const data = await clone.json();
        if (Array.isArray(data)) {
          data.forEach(record => {
            if (record?.id) documentNumbers.set(record.id, record.identity_document_number || "");
          });
        }
      } catch (_) {
        // Algunas respuestas de Supabase no contienen JSON; no afecta al funcionamiento normal.
      }
    }
    return response;
  };

  document.addEventListener("DOMContentLoaded", () => {
    ensureDocumentField();
    document.addEventListener("submit", (event) => {
      if (event.target?.id !== "record-form") return;
      if (document.getElementById("record-type")?.value !== "caregiver") return;
      caregiverSaveInProgress = true;
      window.setTimeout(() => { caregiverSaveInProgress = false; }, 0);
    }, true);
    document.addEventListener("click", (event) => {
      const edit = event.target.closest("[data-edit-caregiver]");
      if (!edit) return;
      window.setTimeout(() => setDocumentFromRecord(edit.dataset.editCaregiver), 0);
    });
  });
})();
