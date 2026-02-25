// ===============================
// CONFIG
const ALLOWED_EMAIL = "juha.vilmusenaho2026@gmail.com";
const CLIENT_ID = "767469865393-5m24jc369g65fh5d51mcu1moocjd27r9.apps.googleusercontent.com";
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbzxFeMmvmg9YD7izZR6zwcyGLd82p2mfI6_s29WILdnHmmpRH4DLWTOTaMii78w899Z5A/exec"; // <-- PASTE your /exec URL here after Apps Script deploy
// ===============================

let googleIdToken = null;
let loggedInEmail = null;

function $(id) { return document.getElementById(id); }

function lockApp(isLocked) {
  const app = $("appRoot");
  if (!app) return;
  if (isLocked) app.classList.add("app-locked");
  else app.classList.remove("app-locked");
}

function setAuthStatus(msg, isError=false) {
  const el = $("authStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "authstatus" + (isError ? " error" : "");
}

function setLogoutVisible(v) {
  const b = $("btnLogout");
  if (b) b.style.display = v ? "" : "none";
}

function hardLock(reason) {
  googleIdToken = null;
  loggedInEmail = null;
  lockApp(true);
  setLogoutVisible(false);
  setAuthStatus(reason || "Kirjautuminen vaaditaan.", true);
  try { google?.accounts?.id?.disableAutoSelect?.(); } catch {}
}

// GIS callback MUST be global
function handleCredentialResponse(response) {
  setAuthStatus("Varmistetaan kirjautuminen…");
  const token = response?.credential || null;
  if (!token) return hardLock("Kirjautuminen epäonnistui.");

  let email = null;
  try {
    const payload = JSON.parse(atob(String(token).split(".")[1]));
    email = payload?.email || null;
  } catch {
    email = null;
  }

  if (!email) return hardLock("Sähköpostia ei saatu tokenista.");
  if (email !== ALLOWED_EMAIL) return hardLock("Tällä tilillä ei ole käyttöoikeutta.");

  googleIdToken = token;
  loggedInEmail = email;

  setAuthStatus("Kirjautunut: " + loggedInEmail);
  lockApp(false);
  setLogoutVisible(true);
}
window.handleCredentialResponse = handleCredentialResponse;

window.addEventListener("DOMContentLoaded", () => {
  lockApp(true);
  setLogoutVisible(false);
  setAuthStatus("Kirjautuminen vaaditaan.");

  $("btnLogout")?.addEventListener("click", () => {
    hardLock("Kirjauduttu ulos.");
  });
});

// ===============================
// APP LOGIC
(function () {
  const ROWS_COUNT = 12;
  const LS_KEY = "kr_state_v2";
  const LS_LAST_DRIVER = "kr_last_driver_v2";
  const defaultDrivers = ["Tommi", "Juha", "Janne"];

  const tbody = document.querySelector("#raportti tbody");
  const statusMsg = $("statusMsg");

  const modal = $("modal");
  const r2 = $("r2");
  const rahti = $("rahti");
  const lastausPvm = $("lastausPvm");
  const lastausPaikka = $("lastausPaikka");
  const purkuPvm = $("purkuPvm");
  const purkuPaikka = $("purkuPaikka");
  const kuljettaja = $("kuljettaja");
  const maara = $("maara");
  const tonnit = $("tonnit");

  const pvm = $("pvm");
  const auto = $("auto");
  const aloitusKm = $("aloitusKm");
  const km6 = $("km6");
  const km12 = $("km12");
  const endPvm = $("endPvm");

  const saveKuormaBtn = $("saveKuormaBtn");
  const closeModalBtn = $("closeModalBtn");
  const syncFailedBtn = $("syncFailedBtn");
  const finishBtn = $("finishBtn");

  const lastausList = $("lastausList");
  const purkuList = $("purkuList");

  let rows = [];
  let currentIndex = -1;
  let lastDriver = localStorage.getItem(LS_LAST_DRIVER) || "";

  init();

  function init() {
    const today = isoDate(new Date());
    if (pvm && !pvm.value) pvm.value = today;

    const saved = loadState();
    if (saved && Array.isArray(saved.rows) && saved.rows.length === ROWS_COUNT) {
      rows = saved.rows;
      if (auto && saved.auto != null) auto.value = saved.auto;
      if (aloitusKm && saved.aloitusKm != null) aloitusKm.value = saved.aloitusKm;
      if (pvm && saved.pvm != null) pvm.value = saved.pvm;
      if (km6 && saved.km6 != null) km6.value = saved.km6;
      if (km12 && saved.km12 != null) km12.value = saved.km12;
      if (endPvm && saved.endPvm != null) endPvm.value = saved.endPvm;
    } else {
      rows = createEmptyRows();
    }

    initDriverSelect();
    loadSavedLocations();
    renderTable();
    updateStatus();

    tbody?.addEventListener("click", onTableClick);
    saveKuormaBtn && (saveKuormaBtn.onclick = saveKuorma);
    closeModalBtn && (closeModalBtn.onclick = closeModal);
    syncFailedBtn && (syncFailedBtn.onclick = sendFailedRows);
    finishBtn && (finishBtn.onclick = finishReport);

    [pvm, auto, aloitusKm, km6, km12, endPvm].forEach((x) => {
      if (!x) return;
      x.addEventListener("change", persist);
      x.addEventListener("input", persist);
    });
  }

  function createEmptyRows() {
    return Array.from({ length: ROWS_COUNT }, (_, i) => ({ index: i + 1, status: "empty", data: {} }));
  }

  function renderTable() {
    if (!tbody) return;
    tbody.innerHTML = "";
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.dataset.index = String(r.index);
      const d = r.data || {};
      tr.innerHTML = `
        <td>${r.index}</td>
        <td>${escapeHtml(d.r2 || "")}</td>
        <td>${escapeHtml(d.rahti || "")}</td>
        <td>${escapeHtml(d.lastausPvm || "")}</td>
        <td>${escapeHtml(d.lastausPaikka || "")}</td>
        <td>${escapeHtml(d.purkuPvm || "")}</td>
        <td>${escapeHtml(d.purkuPaikka || "")}</td>
        <td>${escapeHtml(d.kuljettaja || "")}</td>
        <td>${escapeHtml(d.maara || "")}</td>
        <td>${escapeHtml(d.tonnit || "")}</td>
        <td class="${statusClass(r.status)}">${statusSymbol(r.status)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function statusSymbol(s) {
    if (s === "ok") return "✓";
    if (s === "fail") return "!";
    if (s === "sending") return "…";
    return "";
  }
  function statusClass(s) {
    if (s === "ok") return "status-ok";
    if (s === "fail") return "status-fail";
    if (s === "sending") return "status-wait";
    return "";
  }

  function requireAuthOrAlert() {
    if (loggedInEmail !== ALLOWED_EMAIL || !googleIdToken) {
      hardLock("Kirjautuminen vaaditaan.");
      alert("Kirjaudu sisään ennen käyttöä.");
      return false;
    }
    return true;
  }

  function ensureCheckpointBeforeOpen(rowIndex0Based) {
    const rowNum = rowIndex0Based + 1;
    if (rowNum === 6) {
      const cur = (km6?.value || "").trim();
      if (!cur) {
        const v = prompt("Syötä kilometrit (6 kuorman jälkeen):");
        if (!v) return false;
        if (km6) km6.value = String(v).trim();
        persist();
      }
    }
    if (rowNum === 12) {
      const curKm = (km12?.value || "").trim();
      if (!curKm) {
        const v = prompt("Syötä loppukilometrit (12 kuorman jälkeen):");
        if (!v) return false;
        if (km12) km12.value = String(v).trim();
      }
      const curDate = (endPvm?.value || "").trim();
      if (!curDate) {
        const today = isoDate(new Date());
        const v2 = prompt("Syötä lopetuspäivämäärä (YYYY-MM-DD):", today);
        if (!v2) return false;
        if (endPvm) endPvm.value = String(v2).trim();
      }
      persist();
    }
    return true;
  }

  function onTableClick(e) {
    if (!requireAuthOrAlert()) return;
    const tr = e.target.closest("tr");
    if (!tr) return;
    currentIndex = parseInt(tr.dataset.index, 10) - 1;
    if (!ensureCheckpointBeforeOpen(currentIndex)) return;
    openModal(rows[currentIndex]);
  }

  function openModal(row) {
    if (!row) return;
    const d = row.data || {};
    const today = isoDate(new Date());
    r2.value = d.r2 || "";
    rahti.value = d.rahti || "";
    lastausPvm.value = d.lastausPvm || today;
    purkuPvm.value = d.purkuPvm || today;
    lastausPaikka.value = d.lastausPaikka || "";
    purkuPaikka.value = d.purkuPaikka || "";
    kuljettaja.value = d.kuljettaja || lastDriver || "";
    maara.value = d.maara || "";
    tonnit.value = d.tonnit || "";
    modal?.classList.remove("hidden");
  }

  function closeModal() { modal?.classList.add("hidden"); }

  async function saveKuorma() {
    if (!requireAuthOrAlert()) return;
    if (currentIndex < 0 || currentIndex >= rows.length) return;

    let drv = (kuljettaja.value || "").trim();
    if (drv === "Lisää uusi…") {
      const uusi = prompt("Syötä kuljettajan nimi:");
      if (uusi && uusi.trim()) {
        drv = uusi.trim();
        addDriver(drv);
        kuljettaja.value = drv;
      } else return;
    }
    lastDriver = drv;
    localStorage.setItem(LS_LAST_DRIVER, lastDriver);

    const d = {
      r2: (r2.value || "").trim(),
      rahti: (rahti.value || "").trim(),
      lastausPvm: (lastausPvm.value || "").trim(),
      lastausPaikka: (lastausPaikka.value || "").trim(),
      purkuPvm: (purkuPvm.value || "").trim(),
      purkuPaikka: (purkuPaikka.value || "").trim(),
      kuljettaja: drv,
      maara: (maara.value || "").trim(),
      tonnit: (tonnit.value || "").trim(),
    };

    saveLocation("lastausList", d.lastausPaikka);
    saveLocation("purkuList", d.purkuPaikka);

    rows[currentIndex].data = d;

    if (hasAnyContent(d)) await sendRow(currentIndex);
    else rows[currentIndex].status = "empty";

    closeModal();
    renderTable();
    persist();
    updateStatus();
  }

  function hasAnyContent(d) {
    return Object.values(d).some((v) => String(v || "").trim().length > 0);
  }

  async function sendRow(i) {
    const row = rows[i];
    if (!row) return;

    if (!requireAuthOrAlert()) {
      row.status = "fail";
      renderTable();
      persist();
      updateStatus();
      return;
    }

    if (!SHEETS_URL || SHEETS_URL.includes("PASTE_YOUR_APPS_SCRIPT_WEBAPP_EXEC_URL_HERE")) {
      row.status = "fail";
      renderTable();
      persist();
      updateStatus();
      alert("SHEETS_URL puuttuu. Lisää Apps Script /exec URL script.js:ään.");
      return;
    }

    row.status = "sending";
    renderTable();

    const header = {
      pvm: (pvm?.value || "").trim(),
      auto: (auto?.value || "").trim(),
      aloitusKm: (aloitusKm?.value || "").trim(),
      km6: (km6?.value || "").trim(),
      km12: (km12?.value || "").trim(),
      endPvm: (endPvm?.value || "").trim(),
    };

    const body = Object.assign({}, header, row.data || {}, {
      idToken: googleIdToken,
      email: loggedInEmail || ""
    });

    try {
      const res = await fetch(SHEETS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
      });

      const txt = await res.text();
      let ok = false;
      try {
        const j = JSON.parse(txt);
        ok = j && j.ok === true;
      } catch {
        ok = (txt || "").trim().toUpperCase() === "OK";
      }

      row.status = res.ok && ok ? "ok" : "fail";
    } catch {
      row.status = "fail";
    }

    persist();
    renderTable();
    updateStatus();
  }

  async function sendFailedRows() {
    if (!requireAuthOrAlert()) return;
    const failedIdx = rows.map((r, idx) => ({ r, idx })).filter(x => x.r.status === "fail").map(x => x.idx);
    if (!failedIdx.length) return setStatus("Ei epäonnistuneita rivejä.");
    setStatus(`Lähetetään ${failedIdx.length} epäonnistunutta...`);
    for (const idx of failedIdx) await sendRow(idx);
    setStatus("Valmis.");
  }

  function finishReport() {
    if (!requireAuthOrAlert()) return;

    const filledNow = rows.filter((r) => r.status !== "empty").length;
    if (filledNow > 0) {
      const needKm12 = !(km12 && String(km12.value || "").trim());
      const needEndPvm = !(endPvm && String(endPvm.value || "").trim());
      if (needKm12 || needEndPvm) {
        if (!ensureCheckpointBeforeOpen(11)) return;
      }
    }

    const filled = rows.filter((r) => r.status !== "empty").length;
    if (!confirm(`Päätetäänkö raportti ja aloitetaan uusi?\n\nTäytettyjä rivejä: ${filled}/${ROWS_COUNT}`)) return;

    rows = createEmptyRows();
    currentIndex = -1;
    renderTable();
    persist();
    updateStatus();
    setStatus("Uusi raportti aloitettu.");
  }

  function updateStatus() {
    const filled = rows.filter((r) => r.status !== "empty").length;
    const okCount = rows.filter((r) => r.status === "ok").length;
    const failCount = rows.filter((r) => r.status === "fail").length;

    let msg = `Täytettyjä rivejä: ${filled}/${ROWS_COUNT}`;
    if (okCount) msg += ` • Lähetetty: ${okCount}`;
    if (failCount) msg += ` • Epäonnistunut: ${failCount} (paina “Lähetä epäonnistuneet”)`;
    setStatus(msg);
  }

  function setStatus(text) { if (statusMsg) statusMsg.textContent = text || ""; }

  function initDriverSelect() {
    if (!kuljettaja) return;
    kuljettaja.innerHTML = "";
    defaultDrivers.forEach(addDriver);
    addDriver("Lisää uusi…");
    if (lastDriver && [...kuljettaja.options].some(o => o.value === lastDriver)) kuljettaja.value = lastDriver;
  }

  function addDriver(name) {
    if (!kuljettaja) return;
    if ([...kuljettaja.options].some(o => o.value === name)) return;
    const opt = document.createElement("option");
    opt.value = opt.textContent = name;
    const addNewOpt = [...kuljettaja.options].find(o => o.value === "Lisää uusi…");
    if (addNewOpt) kuljettaja.insertBefore(opt, addNewOpt);
    else kuljettaja.appendChild(opt);
  }

  function saveLocation(listId, value) {
    const v = (value || "").trim();
    if (!v) return;
    const key = `kr_${listId}_v2`;
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    if (!saved.includes(v)) {
      saved.push(v);
      localStorage.setItem(key, JSON.stringify(saved));
    }
    loadSavedLocations();
  }

  function loadSavedLocations() {
    fillDatalist("lastausList", lastausList);
    fillDatalist("purkuList", purkuList);
  }

  function fillDatalist(listId, listEl) {
    if (!listEl) return;
    const key = `kr_${listId}_v2`;
    const items = JSON.parse(localStorage.getItem(key) || "[]");
    listEl.innerHTML = "";
    items.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      listEl.appendChild(opt);
    });
  }

  function persist() {
    const state = {
      pvm: pvm?.value || "",
      auto: auto?.value || "",
      aloitusKm: aloitusKm?.value || "",
      km6: km6?.value || "",
      km12: km12?.value || "",
      endPvm: endPvm?.value || "",
      rows,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }

  function loadState() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); }
    catch { return null; }
  }

  function isoDate(d) { return new Date(d).toISOString().slice(0, 10); }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
