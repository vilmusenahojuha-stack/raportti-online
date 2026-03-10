// ===============================
// CONFIG
const ALLOWED_EMAIL = "juha.vilmusenaho2026@gmail.com";
const CLIENT_ID = "767469865393-5m24jc369g65fh5d51mcu1moocjd27r9.apps.googleusercontent.com";
const SHEETS_URL = "https://script.google.com/macros/s/AKfycby-qGhTBMk2cASKCAkG_Sv1SHxgBXHjCFDAdctu2qyRQ1Q-wMR-EIVud7evkZXdgHsdGg/exec";
// ===============================

const LS_TOKEN = "kr_idtoken_v3";
const LS_EMAIL = "kr_email_v4";
const LS_BROWSER_KEY = "kr_browser_key_v1";
const LS_BROWSER_OK = "kr_browser_ok_v1";

let googleIdToken = null;
let loggedInEmail = null;
let browserKey = null;
let browserApproved = false;

function $(id) { return document.getElementById(id); }

function lockApp(isLocked) {
  const app = $("appRoot");
  if (!app) return;
  if (isLocked) app.classList.add("app-locked");
  else app.classList.remove("app-locked");
}

function setAuthStatus(msg, isError = false) {
  const el = $("authStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "authstatus" + (isError ? " error" : "");
}

function setLogoutVisible(v) {
  const b = $("btnLogout");
  if (b) b.style.display = v ? "" : "none";
}

function setUserPill() {
  const pill = $("pillUser");
  if (!pill) return;
  pill.textContent = loggedInEmail ? loggedInEmail : "";
}

function ensureBrowserKey() {
  let key = localStorage.getItem(LS_BROWSER_KEY);
  if (!key) {
    key = `b_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(LS_BROWSER_KEY, key);
  }
  browserKey = key;
  return key;
}

function saveSession(token, email) {
  ensureBrowserKey();
  localStorage.setItem(LS_TOKEN, token || "");
  localStorage.setItem(LS_EMAIL, email);
  localStorage.setItem(LS_BROWSER_OK, "1");
  browserApproved = true;
}

function clearSession() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_EMAIL);
  localStorage.removeItem(LS_BROWSER_OK);
}

function loadSession() {
  browserKey = localStorage.getItem(LS_BROWSER_KEY) || "";
  browserApproved = localStorage.getItem(LS_BROWSER_OK) === "1";
  return {
    token: localStorage.getItem(LS_TOKEN),
    email: localStorage.getItem(LS_EMAIL),
    browserKey,
    browserApproved,
  };
}

function hardLock(reason) {
  clearSession();
  googleIdToken = null;
  loggedInEmail = null;
  browserApproved = false;
  setUserPill();
  lockApp(true);
  setLogoutVisible(false);
  setAuthStatus(reason || "Kirjautuminen vaaditaan.", true);
  try { google?.accounts?.id?.disableAutoSelect?.(); } catch {}
}

async function registerBrowserSession(token, email) {
  ensureBrowserKey();
  const res = await fetch(SHEETS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "registerBrowser",
      idToken: token,
      email,
      browserKey,
    }),
  });

  const txt = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(txt);
  } catch {
    throw new Error("invalid_json");
  }

  if (!res.ok || !parsed?.ok) {
    throw new Error(parsed?.error || "register_failed");
  }
}

async function handleCredentialResponse(response) {
  setAuthStatus("Kirjaudutaan…");
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

  try {
    await registerBrowserSession(token, email);
  } catch (err) {
    console.warn("Selainkirjautumisen rekisteröinti epäonnistui", err);
    return hardLock("Kirjautuminen epäonnistui tällä laitteella.");
  }

  saveSession(token, email);

  setAuthStatus("Kirjautunut: " + loggedInEmail);
  setUserPill();
  lockApp(false);
  setLogoutVisible(true);
}
window.handleCredentialResponse = handleCredentialResponse;

window.addEventListener("DOMContentLoaded", () => {
  const s = loadSession();
  ensureBrowserKey();
  if (s.browserApproved && s.email === ALLOWED_EMAIL) {
    googleIdToken = s.token || null;
    loggedInEmail = s.email;
    setAuthStatus("Kirjautunut tällä laitteella: " + loggedInEmail);
    setUserPill();
    lockApp(false);
    setLogoutVisible(true);
  } else if (s.token && s.email === ALLOWED_EMAIL) {
    googleIdToken = s.token;
    loggedInEmail = s.email;
    setAuthStatus("Kirjautunut: " + loggedInEmail);
    setUserPill();
    lockApp(false);
    setLogoutVisible(true);
  } else {
    lockApp(true);
    setLogoutVisible(false);
    setAuthStatus("Kirjautuminen vaaditaan.");
  }

  $("btnLogout")?.addEventListener("click", () => {
    hardLock("Kirjauduttu ulos.");
  });
});

(function () {
  const ROWS_COUNT = 12;
  const LS_KEY = "kr_state_v7";
  const LS_LAST_DRIVER = "kr_last_driver_v7";
  const LS_DRIVER_LIST = "kr_driver_list_v7";
  const STORAGE_VERSION = "v7";
  const DEFAULT_DRIVERS = ["Juha", "Tommi", "Janne"];

  const tbody = document.querySelector("#raportti tbody");
  const statusMsg = $("statusMsg");

  const modal = $("modal");
  const loadNoEl = $("loadNo");
  const r2 = $("r2");
  const rahti = $("rahti");
  const lastausPvm = $("lastausPvm");
  const lastausPaikka = $("lastausPaikka");
  const purkuPvm = $("purkuPvm");
  const purkuPaikka = $("purkuPaikka");
  const kuljettaja = $("kuljettaja");
  const maara = $("maara");
  const tonnit = $("tonnit");
  const tuote = $("tuote");

  const pvm = $("pvm");
  const auto = $("auto");
  const aloitusKm = $("aloitusKm");
  const kmValue = $("kmValue");
  const btnSetKm = $("btnSetKm");

  const saveKuormaBtn = $("saveKuormaBtn");
  const closeModalBtn = $("closeModalBtn");
  const closeModalBtnX = $("closeModalBtnX");
  const syncFailedBtn = $("syncFailedBtn");
  const finishBtn = $("finishBtn");

  const lastausList = $("lastausList");
  const purkuList = $("purkuList");
  const tuoteList = $("tuoteList");

  let rows = [];
  let currentIndex = -1;
  let kmA = ""; // kuormat 1–6
  let kmB = ""; // kuormat 7–12
  let lastKm = "";
  let lastDriver = localStorage.getItem(LS_LAST_DRIVER) || "";

  init();

  function init() {
    const today = isoDate(new Date());
    if (pvm && !pvm.value) pvm.value = today;

    const saved = loadState();
    if (saved && Array.isArray(saved.rows) && saved.rows.length === ROWS_COUNT) {
      rows = saved.rows.map((r, idx) => ({
        index: idx + 1,
        status: r.status || "empty",
        data: r.data || {},
      }));
      if (auto && saved.auto != null) auto.value = saved.auto;
      if (pvm && saved.pvm != null) pvm.value = saved.pvm;
      kmA = String(saved.kmA || "").trim();
      kmB = String(saved.kmB || "").trim();
      lastKm = String(saved.lastKm || saved.aloitusKm || "").trim();
      if (aloitusKm) aloitusKm.value = lastKm;
    } else {
      rows = createEmptyRows();
      kmA = "";
      kmB = "";
      lastKm = "";
      if (aloitusKm) aloitusKm.value = "";
    }

    initDriverSelect();
    loadSavedValues();
    renderTable();
    updateStatus();
    updateKmUI();

    tbody?.addEventListener("click", onTableClick);
    saveKuormaBtn?.addEventListener("click", saveKuorma);
    closeModalBtn?.addEventListener("click", closeModal);
    closeModalBtnX?.addEventListener("click", closeModal);
    syncFailedBtn?.addEventListener("click", sendFailedRows);
    finishBtn?.addEventListener("click", finishReport);

    [pvm, auto, aloitusKm].forEach((el) => {
      if (!el) return;
      el.addEventListener("change", () => {
        if (el === aloitusKm) {
          lastKm = String(aloitusKm.value || "").trim();
        }
        persist();
        updateKmUI();
      });
      el.addEventListener("input", () => {
        if (el === aloitusKm) {
          lastKm = String(aloitusKm.value || "").trim();
        }
        persist();
        updateKmUI();
      });
    });

    btnSetKm?.addEventListener("click", () => {
      const cur = String(aloitusKm?.value || "").trim();
      const v = prompt("Syötä aloituskilometrit:", cur);
      if (v === null) return;
      const vv = String(v).trim();
      if (aloitusKm) aloitusKm.value = vv;
      lastKm = vv;
      if (currentIndex >= 6 || kmB) kmB = vv;
      else kmA = vv;
      persist();
      updateKmUI();
    });

    modal?.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) closeModal();
    });
  }

  function createEmptyRows() {
    return Array.from({ length: ROWS_COUNT }, (_, i) => ({ index: i + 1, status: "empty", data: {} }));
  }

  function updateKmUI() {
    const v = String(aloitusKm?.value || lastKm || "").trim();
    if (kmValue) kmValue.textContent = v ? v : "—";
  }

  function renderTable() {
    if (!tbody) return;
    tbody.innerHTML = "";
    rows.forEach((row) => {
      const d = row.data || {};
      const tr = document.createElement("tr");
      tr.dataset.index = String(row.index);
      tr.innerHTML = `
        <td>${row.index}</td>
        <td>${escapeHtml(d.r2 || "")}</td>
        <td>${escapeHtml(d.rahti || "")}</td>
        <td>${escapeHtml(formatDateForTable(d.lastausPvm) || "")}</td>
        <td>${escapeHtml(d.lastausPaikka || "")}</td>
        <td>${escapeHtml(formatDateForTable(d.purkuPvm) || "")}</td>
        <td>${escapeHtml(d.purkuPaikka || "")}</td>
        <td>${escapeHtml(d.kuljettaja || "")}</td>
        <td>${escapeHtml(d.maara || "")}</td>
        <td>${escapeHtml(d.tonnit || "")}</td>
        <td>${escapeHtml(d.tuote || "")}</td>
        <td class="${statusClass(row.status)}">${statusSymbol(row.status)}</td>
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

  function setStatus(text) {
    if (statusMsg) statusMsg.textContent = text || "";
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

  function requireAuthOrAlert() {
    if (loggedInEmail !== ALLOWED_EMAIL || !googleIdToken) {
      hardLock("Kirjautuminen vaaditaan.");
      alert("Kirjaudu sisään ennen käyttöä.");
      return false;
    }
    return true;
  }

  async function onTableClick(e) {
    if (!requireAuthOrAlert()) return;
    const tr = e.target.closest("tr");
    if (!tr) return;
    currentIndex = parseInt(tr.dataset.index, 10) - 1;
    await openModal(rows[currentIndex]);
  }

  async function openModal(row) {
    if (!row) return;
    const d = row.data || {};
    const today = isoDate(new Date());

    r2.value = d.r2 || "";
    rahti.value = d.rahti || "";
    lastausPvm.value = d.lastausPvm || today;
    purkuPvm.value = d.purkuPvm || today;
    lastausPaikka.value = d.lastausPaikka || "";
    purkuPaikka.value = d.purkuPaikka || "";
    kuljettaja.value = d.kuljettaja || lastDriver || DEFAULT_DRIVERS[0];
    maara.value = d.maara || "";
    tonnit.value = d.tonnit || "";
    tuote.value = d.tuote || "";

    if (loadNoEl) {
      loadNoEl.value = d.loadNo ? String(d.loadNo) : "Haetaan…";
    }

    modal?.classList.remove("hidden");

    if (!d.loadNo) {
      try {
        const plate = String(auto?.value || "").trim();
        if (!plate) {
          if (loadNoEl) loadNoEl.value = "";
          return;
        }
        const ln = await fetchNextLoadNo(plate);
        d.loadNo = ln;
        row.data = d;
        if (loadNoEl) loadNoEl.value = String(ln);
        persist();
      } catch (err) {
        console.warn("Kuormanumeron haku epäonnistui", err);
        if (loadNoEl) loadNoEl.value = "";
      }
    }
  }

  function closeModal() {
    modal?.classList.add("hidden");
  }

  async function saveKuorma() {
    if (!requireAuthOrAlert()) return;
    if (currentIndex < 0 || currentIndex >= rows.length) return;

    let drv = String(kuljettaja.value || "").trim();
    if (drv === "Lisää uusi…") {
      const uusi = prompt("Syötä kuljettajan nimi:");
      if (!uusi || !uusi.trim()) return;
      drv = uusi.trim();
      addDriver(drv, true);
      kuljettaja.value = drv;
    }
    lastDriver = drv;
    localStorage.setItem(LS_LAST_DRIVER, lastDriver);

    const oldData = rows[currentIndex].data || {};
    const d = {
      loadNo: oldData.loadNo || null,
      r2: String(r2.value || "").trim(),
      rahti: String(rahti.value || "").trim(),
      lastausPvm: String(lastausPvm.value || "").trim(),
      lastausPaikka: String(lastausPaikka.value || "").trim(),
      purkuPvm: String(purkuPvm.value || "").trim(),
      purkuPaikka: String(purkuPaikka.value || "").trim(),
      kuljettaja: drv,
      maara: String(maara.value || "").trim(),
      tonnit: String(tonnit.value || "").trim(),
      tuote: String(tuote.value || "").trim(),
    };

    rows[currentIndex].data = d;

    saveSuggestion("lastausList", d.lastausPaikka);
    saveSuggestion("purkuList", d.purkuPaikka);
    saveSuggestion("tuoteList", d.tuote);

    if (hasAnyContent(d)) {
      await sendRow(currentIndex);
    } else {
      rows[currentIndex].status = "empty";
      persist();
      renderTable();
      updateStatus();
    }

    closeModal();
  }

  function hasAnyContent(d) {
    return [d.r2, d.rahti, d.lastausPvm, d.lastausPaikka, d.purkuPvm, d.purkuPaikka, d.kuljettaja, d.maara, d.tonnit, d.tuote]
      .some((v) => String(v || "").trim().length > 0);
  }

  async function ensureKmForRow(index) {
    if (index === 0 && !String(kmA || "").trim()) {
      const v = prompt("Syötä aloituskilometrit (kuormat 1–6):", String(aloitusKm?.value || lastKm || "").trim());
      if (v === null || !String(v).trim()) return false;
      kmA = String(v).trim();
      lastKm = kmA;
      if (aloitusKm) aloitusKm.value = kmA;
      persist();
      updateKmUI();
    }

    if (index === 5) {
      const v = prompt("Syötä aloituskilometrit (kuormat 7–12):", String(kmB || lastKm || "").trim());
      if (v === null || !String(v).trim()) return false;
      kmB = String(v).trim();
      lastKm = kmB;
      if (aloitusKm) aloitusKm.value = kmB;
      persist();
      updateKmUI();
    }

    if (index >= 6 && !String(kmB || "").trim()) {
      const v = prompt("Syötä aloituskilometrit (kuormat 7–12):", String(aloitusKm?.value || lastKm || "").trim());
      if (v === null || !String(v).trim()) return false;
      kmB = String(v).trim();
      lastKm = kmB;
      if (aloitusKm) aloitusKm.value = kmB;
      persist();
      updateKmUI();
    }

    return true;
  }

  async function sendRow(index) {
    const row = rows[index];
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

    const okKm = await ensureKmForRow(index);
    if (!okKm) {
      row.status = "fail";
      renderTable();
      persist();
      updateStatus();
      return;
    }

    row.status = "sending";
    renderTable();
    persist();

    const plate = String(auto?.value || "").trim();
    if (!plate) {
      row.status = "fail";
      renderTable();
      persist();
      updateStatus();
      alert("Syötä Auto nro ennen tallennusta.");
      return;
    }

    const reportDate = String(pvm?.value || "").trim() || isoDate(new Date());
    const startKmForRow = index < 6 ? String(kmA || "").trim() : String(kmB || "").trim();
    const data = row.data || {};

    const body = {
      pvm: reportDate,
      auto: plate,
      aloitusKm: startKmForRow,
      loadNo: data.loadNo || "",
      r2: data.r2 || "",
      rahti: data.rahti || "",
      lastausPvm: data.lastausPvm || "",
      lastausPaikka: data.lastausPaikka || "",
      purkuPvm: data.purkuPvm || "",
      purkuPaikka: data.purkuPaikka || "",
      kuljettaja: data.kuljettaja || "",
      maara: data.maara || "",
      tonnit: data.tonnit || "",
      tuote: data.tuote || "",
      idToken: googleIdToken,
      email: loggedInEmail || "",
    };

    try {
      const res = await fetch(SHEETS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
      });

      const txt = await res.text();
      let parsed = null;
      let ok = false;
      try {
        parsed = JSON.parse(txt);
        ok = parsed && parsed.ok === true;
      } catch {
        ok = (txt || "").trim().toUpperCase() === "OK";
      }

      if (!(res.ok && ok) && parsed && ["invalid_token", "aud_mismatch", "forbidden_email"].includes(parsed.error)) {
        hardLock("Kirjautuminen vanhentui. Kirjaudu uudelleen.");
      }

      if (res.ok && ok && parsed?.loadNo) {
        row.data.loadNo = parsed.loadNo;
        if (loadNoEl && currentIndex === index) loadNoEl.value = String(parsed.loadNo);
      }

      row.status = res.ok && ok ? "ok" : "fail";
    } catch (err) {
      console.warn("Tallennus epäonnistui", err);
      row.status = "fail";
    }

    persist();
    renderTable();
    updateStatus();
  }

  async function sendFailedRows() {
    if (!requireAuthOrAlert()) return;
    const failedIdx = rows.map((r, idx) => ({ r, idx })).filter((x) => x.r.status === "fail").map((x) => x.idx);
    if (!failedIdx.length) {
      setStatus("Ei epäonnistuneita rivejä.");
      return;
    }
    setStatus(`Lähetetään ${failedIdx.length} epäonnistunutta...`);
    for (const idx of failedIdx) {
      await sendRow(idx);
    }
    setStatus("Valmis.");
  }

  function finishReport() {
    if (!requireAuthOrAlert()) return;
    const filled = rows.filter((r) => r.status !== "empty").length;
    if (!confirm(`Päätetäänkö raportti ja aloitetaan uusi?\n\nTäytettyjä rivejä: ${filled}/${ROWS_COUNT}`)) return;

    const next = prompt("Syötä seuraavan raportin aloituskilometrit (voit jättää tyhjäksi):", String(aloitusKm?.value || "").trim());
    const nextKm = next == null ? "" : String(next).trim();

    rows = createEmptyRows();
    currentIndex = -1;
    kmA = nextKm;
    kmB = "";
    lastKm = nextKm;
    if (aloitusKm) aloitusKm.value = nextKm;
    renderTable();
    persist();
    updateKmUI();
    updateStatus();
    setStatus("Uusi raportti aloitettu.");
  }

  function initDriverSelect() {
    if (!kuljettaja) return;
    kuljettaja.innerHTML = "";
    const savedDrivers = loadDriverList();
    [...DEFAULT_DRIVERS, ...savedDrivers].forEach((name) => addDriver(name, false));
    addDriver("Lisää uusi…", false);
    const preferred = lastDriver && [...kuljettaja.options].some((o) => o.value === lastDriver)
      ? lastDriver
      : DEFAULT_DRIVERS[0];
    kuljettaja.value = preferred;
  }

  function addDriver(name, persistList) {
    const clean = String(name || "").trim();
    if (!clean || !kuljettaja) return;
    if ([...kuljettaja.options].some((o) => o.value === clean)) return;
    const opt = document.createElement("option");
    opt.value = clean;
    opt.textContent = clean;
    const addNewOpt = [...kuljettaja.options].find((o) => o.value === "Lisää uusi…");
    if (addNewOpt) kuljettaja.insertBefore(opt, addNewOpt);
    else kuljettaja.appendChild(opt);
    if (persistList && clean !== "Lisää uusi…") saveDriverList(clean);
  }

  function loadDriverList() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS_DRIVER_LIST) || "[]");
      return Array.isArray(arr) ? arr.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function saveDriverList(name) {
    const arr = loadDriverList();
    if (!arr.includes(name) && !DEFAULT_DRIVERS.includes(name)) {
      arr.push(name);
      localStorage.setItem(LS_DRIVER_LIST, JSON.stringify(arr));
    }
  }

  function saveSuggestion(listId, value) {
    const v = String(value || "").trim();
    if (!v) return;
    const key = `kr_${listId}_${STORAGE_VERSION}`;
    let items = [];
    try {
      items = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(items)) items = [];
    } catch {
      items = [];
    }
    if (!items.includes(v)) {
      items.push(v);
      localStorage.setItem(key, JSON.stringify(items));
    }
    loadSavedValues();
  }

  function loadSavedValues() {
    fillDatalist("lastausList", lastausList);
    fillDatalist("purkuList", purkuList);
    fillDatalist("tuoteList", tuoteList);
  }

  function fillDatalist(listId, listEl) {
    if (!listEl) return;
    const key = `kr_${listId}_${STORAGE_VERSION}`;
    let items = [];
    try {
      items = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(items)) items = [];
    } catch {
      items = [];
    }
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
      kmA,
      kmB,
      lastKm,
      rows,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "null");
    } catch {
      return null;
    }
  }

  async function fetchNextLoadNo(plate) {
    const cleanPlate = String(plate || "").trim();
    if (!cleanPlate) throw new Error("missing_plate");
    if (!SHEETS_URL || SHEETS_URL.includes("PASTE_YOUR_APPS_SCRIPT_WEBAPP_EXEC_URL_HERE")) {
      throw new Error("missing_sheets_url");
    }
    const url = `${SHEETS_URL}?action=nextLoadNumber&plate=${encodeURIComponent(cleanPlate)}`;
    const res = await fetch(url, { method: "GET" });
    const txt = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(txt);
    } catch {
      throw new Error("invalid_json");
    }
    if (!res.ok || !parsed?.ok) {
      throw new Error(parsed?.error || "loadno_failed");
    }
    return String(parsed.loadNo || "");
  }

  function isoDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDateForTable(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
    if (!m) return ymd || "";
    return `${m[3]}.${m[2]}.${m[1]}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
