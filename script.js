// Raportti Online – script.js (v5)
// Korjaukset:
//  - Lastaus/Purku paikkojen ehdotukset datalistista (ei esitäyttöä)
//  - Päivämäärä kenttiin oletuksena kuluva päivä (kun avataan rivi, jos tyhjä)
//  - Kuljettajat-valikko täytetään aina
//  - Kuorma 6 km-kysely vasta lähetettäessä (asetetaan kuormille 7–12)
//  - Sheets-otsikot hoidetaan Apps Scriptissä

// ===============================
// CONFIG
const ALLOWED_EMAIL = "juha.vilmusenaho2026@gmail.com";
const CLIENT_ID = "767469865393-5m24jc369g65fh5d51mcu1moocjd27r9.apps.googleusercontent.com";
const SHEETS_URL = "PASTE_YOUR_APPS_SCRIPT_WEBAPP_EXEC_URL_HERE"; // <-- paste your /exec URL
// ===============================

const LS_TOKEN = "kr_idtoken_v3";
const LS_EMAIL = "kr_email_v3";
const LS_STATE = "kr_state_v5";
const LS_LAST_DRIVER = "kr_last_driver_v5";

const ROWS_COUNT = 12;

const DEFAULT_DRIVERS = ["Juha", "Tommi", "Janne"];

const $ = (id) => document.getElementById(id);
const TBody = () => document.querySelector("#raportti tbody");

let loggedInEmail = "";
let idToken = "";

let rows = [];
let currentIndex = -1;

// kmA: kuormat 1–6
// kmB: kuormat 7–12 (kysytään kun lähetetään kuorma 6)
let kmA = "";
let kmB = "";
let lastKm = ""; // yläpalkki

function isoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function todayIso() {
  return isoDate(new Date());
}

function safeParseJSON(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function lockApp(locked) {
  const root = $("appRoot");
  if (!root) return;
  if (locked) root.classList.add("app-locked");
  else root.classList.remove("app-locked");
}

function setAuthStatus(msg, isOk) {
  const el = $("authStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "status " + (isOk ? "ok" : "bad");
}

function hardLock(msg) {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_EMAIL);
  loggedInEmail = "";
  idToken = "";
  lockApp(true);
  $("authBox") && ($("authBox").style.display = "block");
  setAuthStatus(msg || "Et ole kirjautunut.", false);
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

window.handleCredentialResponse = function handleCredentialResponse(response) {
  try {
    const token = response.credential;
    const payload = decodeJwtPayload(token);
    const email = payload?.email || "";

    if (!email || email !== ALLOWED_EMAIL) {
      hardLock("Väärä käyttäjä. Vain sallittu sähköposti voi käyttää sovellusta.");
      return;
    }

    idToken = token;
    loggedInEmail = email;
    localStorage.setItem(LS_TOKEN, idToken);
    localStorage.setItem(LS_EMAIL, loggedInEmail);

    $("authBox") && ($("authBox").style.display = "none");
    lockApp(false);
    setAuthStatus("Kirjautunut: " + email, true);
  } catch {
    hardLock("Kirjautuminen epäonnistui.");
  }
};

function requireAuthOrAlert() {
  if (!idToken || !loggedInEmail) {
    alert("Kirjaudu ensin.");
    return false;
  }
  return true;
}

function createEmptyRows() {
  return Array.from({ length: ROWS_COUNT }, (_, i) => ({
    index: i + 1,
    status: "empty", // empty | sending | ok | fail
    loadNo: null,    // juokseva kuormanumero (haetaan serveriltä)
    data: {
      r2: "",
      rahti: "",
      lastausPvm: "",
      lastausPaikka: "",
      purkuPvm: "",
      purkuPaikka: "",
      kuljettaja: "",
      maara: "",
      tonnit: "",
      tuote: "",
    },
  }));
}

function persist() {
  const state = {
    pvm: $("pvm")?.value || "",
    auto: $("auto")?.value || "",
    kmA,
    kmB,
    lastKm,
    rows,
  };
  localStorage.setItem(LS_STATE, JSON.stringify(state));
}

function loadState() {
  return safeParseJSON(localStorage.getItem(LS_STATE) || "null", null);
}

function updateKmUI() {
  const el = $("kmValue");
  if (el) el.textContent = lastKm ? String(lastKm) : "—";
}

function setStatus(msg) {
  const el = $("statusMsg");
  if (el) el.textContent = msg || "";
}


function initDriverSelect() {
  const sel = $("kuljettaja");
  if (!sel) return;

  // yhdistä oletukset + aiemmin lisätyt
  const saved = safeParseJSON(localStorage.getItem("kr_drivers_v5") || "[]", []);
  const uniq = [];
  [...DEFAULT_DRIVERS, ...saved].forEach((n) => {
    const t = String(n || "").trim();
    if (t && !uniq.includes(t)) uniq.push(t);
  });

  sel.innerHTML = "";
  uniq.forEach((n) => {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    sel.appendChild(opt);
  });

  const optAdd = document.createElement("option");
  optAdd.value = "__ADD__";
  optAdd.textContent = "Lisää uusi…";
  sel.appendChild(optAdd);

  const last = localStorage.getItem(LS_LAST_DRIVER) || "";
  if (last && uniq.includes(last)) sel.value = last;
  else sel.value = uniq[0] || "";
}

function addDriver(name) {
  const n = String(name || "").trim();
  if (!n) return;
  const saved = safeParseJSON(localStorage.getItem("kr_drivers_v5") || "[]", []);
  if (!saved.includes(n)) saved.push(n);
  localStorage.setItem("kr_drivers_v5", JSON.stringify(saved));
  initDriverSelect();
}

function saveLocation(listId, value) {
  const v = String(value || "").trim();
  if (!v) return;
  const key = `kr_${listId}_v5`;
  const saved = safeParseJSON(localStorage.getItem(key) || "[]", []);
  if (!saved.includes(v)) saved.push(v);
  localStorage.setItem(key, JSON.stringify(saved));
  loadSavedLocations();
}

function fillDatalist(listId, listEl) {
  if (!listEl) return;
  const key = `kr_${listId}_v5`;
  const items = safeParseJSON(localStorage.getItem(key) || "[]", []);
  listEl.innerHTML = "";
  items.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    listEl.appendChild(opt);
  });
}

function loadSavedLocations() {
  fillDatalist("lastausList", $("lastausList"));
  fillDatalist("purkuList", $("purkuList"));
}

function renderTable() {
  const tbody = TBody();
  if (!tbody) return;
  tbody.innerHTML = "";

  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.dataset.index = String(i);

    const status = r.status || "empty";
    tr.className = status === "ok" ? "row-ok" : status === "fail" ? "row-fail" : "";

    const d = r.data || {};
    tr.innerHTML = `
      <td class="col-idx">${r.index}</td>
      <td class="col-r2">${escapeHtml(d.r2 || "")}</td>
      <td class="col-loadno">${r.loadNo ? escapeHtml(String(r.loadNo)) : ""}</td>
      <td class="col-places">${escapeHtml(d.lastausPaikka || "")} → ${escapeHtml(d.purkuPaikka || "")}</td>
      <td class="col-status">${statusLabel(status)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function statusLabel(s) {
  if (s === "ok") return "OK";
  if (s === "fail") return "VIRHE";
  if (s === "sending") return "LÄHETETÄÄN";
  return "";
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function openModalForIndex(idx) {
  currentIndex = idx;
  const r = rows[idx];
  const d = r?.data || {};

  // täytä kentät
  $("r2").value = d.r2 || "";
  $("rahti").value = d.rahti || "";
  $("lastausPvm").value = d.lastausPvm || "";
  $("lastausPaikka").value = d.lastausPaikka || "";
  $("purkuPvm").value = d.purkuPvm || "";
  $("purkuPaikka").value = d.purkuPaikka || "";
  $("maara").value = d.maara || "";
  $("tonnit").value = d.tonnit || "";
  $("tuote").value = d.tuote || "";

  // päivämäärä kenttiin kuluva päivä, jos tyhjä
  const t = todayIso();
  if (!$("lastausPvm").value) $("lastausPvm").value = t;
  if (!$("purkuPvm").value) $("purkuPvm").value = t;

  // kuljettaja
  initDriverSelect();
  const drv = (d.kuljettaja || "").trim();
  if (drv) $("kuljettaja").value = drv;

  $("modal").classList.remove("hidden");
}

function closeModal() {
  $("modal").classList.add("hidden");
  currentIndex = -1;
}

function hasAnyContent(d) {
  return Object.values(d || {}).some((v) => String(v || "").trim() !== "");
}

async function getNextLoadNumber() {
  const url = SHEETS_URL + (SHEETS_URL.includes("?") ? "&" : "?") + "action=nextLoadNumber";
  const res = await fetch(url, { method: "GET" });
  const txt = await res.text();
  let j = null;
  try { j = JSON.parse(txt); } catch { j = null; }
  if (!j || !j.ok) throw new Error(j?.error || "nextLoadNumber epäonnistui");
  return j.nextLoadNumber;
}

async function sendRow(idx) {
  if (!requireAuthOrAlert()) return;

  const pvm = ($("pvm")?.value || "").trim() || todayIso();
  const auto = ($("auto")?.value || "").trim();
  if (!auto) {
    alert("Syötä rekisterinumero (Auto).");
    return;
  }

  // kmA pakollinen ennen kuormaa 1 (jos tyhjä)
  if (idx === 0 && !kmA) {
    const v = prompt("Lisää aloituskilometrit (kuormat 1–6):");
    if (!v || !String(v).trim()) return;
    kmA = String(v).trim();
    const kmInput = $("aloitusKm");
    if (kmInput) kmInput.value = kmA;
    lastKm = kmA;
    updateKmUI();
  }

  // Kuorma 6: kysy kmB vasta kun lähetetään kuorma 6
  if (idx === 5) {
    const v = prompt("Lisää aloituskilometrit seuraaville kuormille (7–12):");
    if (!v || !String(v).trim()) return;
    kmB = String(v).trim();
    lastKm = kmB;
    updateKmUI();
  }

  // Kuormille 7–12 kmB pakollinen
  if (idx >= 6 && !kmB) {
    const v = prompt("Lisää aloituskilometrit kuormille (7–12):");
    if (!v || !String(v).trim()) return;
    kmB = String(v).trim();
    lastKm = kmB;
    updateKmUI();
  }

  // startKm per rivi
  const startKm = idx < 6 ? (kmA || "") : (kmB || "");

  // juokseva loadNo
  if (!rows[idx].loadNo) {
    try {
      rows[idx].loadNo = await getNextLoadNumber();
    } catch (e) {
      console.warn(e);
      // jos ei saada, jatketaan ilman (ei blokkia)
    }
  }

  rows[idx].status = "sending";
  renderTable();
  persist();

  const payload = {
    action: "saveRow",
    auth: { idToken, email: loggedInEmail, clientId: CLIENT_ID },
    header: { pvm, auto, kmA, kmB },
    row: {
      rowIndex: idx + 1,
      loadNo: rows[idx].loadNo,
      startKm,
      ...rows[idx].data,
    },
    // merkitään kmB-asetushetki (kuorma 6)
    kmBSetAtLoad6: idx === 5 ? kmB : "",
  };

  try {
    const res = await fetch(SHEETS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const txt = await res.text();
    let j = null;
    try { j = JSON.parse(txt); } catch { j = null; }

    const ok = (j && j.ok) || txt.trim() === "OK";
    if (!ok) throw new Error(j?.error || txt || "Tallennus epäonnistui");

    rows[idx].status = "ok";
    setStatus("Tallennettu.");
  } catch (e) {
    const msg = String(e?.message || e);
    rows[idx].status = "fail";
    setStatus("Virhe: " + msg);

    // token-virheet -> lukitse
    if (msg.includes("invalid_token") || msg.includes("aud_mismatch") || msg.includes("forbidden_email")) {
      hardLock("Kirjautuminen vanhentui tai ei sallittu. Kirjaudu uudelleen.");
    }
  } finally {
    renderTable();
    persist();
  }
}

async function saveKuorma() {
  if (!requireAuthOrAlert()) return;
  if (currentIndex < 0 || currentIndex >= rows.length) return;

  // kuljettaja
  let drv = ($("kuljettaja").value || "").trim();
  if (drv === "__ADD__") {
    const uusi = prompt("Syötä kuljettajan nimi:");
    if (uusi && uusi.trim()) {
      drv = uusi.trim();
      addDriver(drv);
      $("kuljettaja").value = drv;
    } else {
      return;
    }
  }
  if (drv) localStorage.setItem(LS_LAST_DRIVER, drv);

  const d = {
    r2: ($("r2").value || "").trim(),
    rahti: ($("rahti").value || "").trim(),
    lastausPvm: ($("lastausPvm").value || "").trim(),
    lastausPaikka: ($("lastausPaikka").value || "").trim(),
    purkuPvm: ($("purkuPvm").value || "").trim(),
    purkuPaikka: ($("purkuPaikka").value || "").trim(),
    kuljettaja: drv,
    maara: ($("maara").value || "").trim(),
    tonnit: ($("tonnit").value || "").trim(),
    tuote: ($("tuote").value || "").trim(),
  };

  // tallenna paikat ehdotuksiin (mutta älä esitäytä)
  saveLocation("lastausList", d.lastausPaikka);
  saveLocation("purkuList", d.purkuPaikka);

  rows[currentIndex].data = d;

  if (hasAnyContent(d)) {
    await sendRow(currentIndex);
  } else {
    rows[currentIndex].status = "empty";
    rows[currentIndex].loadNo = null;
    renderTable();
    persist();
  }

  closeModal();
}

async function sendFailedRows() {
  if (!requireAuthOrAlert()) return;
  const failedIdx = rows.map((r, idx) => ({ r, idx }))
    .filter((x) => x.r.status === "fail")
    .map((x) => x.idx);

  if (!failedIdx.length) return setStatus("Ei epäonnistuneita rivejä.");
  setStatus(`Lähetetään ${failedIdx.length} epäonnistunutta...`);
  for (const idx of failedIdx) await sendRow(idx);
  setStatus("Valmis.");
}

function finishReport() {
  if (!requireAuthOrAlert()) return;
  if (!confirm("Päätetäänkö raportti ja aloitetaan uusi?")) return;

  rows = createEmptyRows();
  kmA = "";
  kmB = "";
  lastKm = "";
  updateKmUI();
  renderTable();
  persist();
  setStatus("Uusi raportti aloitettu.");
}

function init() {
  // auth restore
  idToken = localStorage.getItem(LS_TOKEN) || "";
  loggedInEmail = localStorage.getItem(LS_EMAIL) || "";

  if (idToken && loggedInEmail === ALLOWED_EMAIL) {
    $("authBox") && ($("authBox").style.display = "none");
    lockApp(false);
    setAuthStatus("Kirjautunut: " + loggedInEmail, true);
  } else {
    hardLock("Kirjaudu sisään Googlella.");
  }

  // header defaults
  if ($("pvm") && !$("pvm").value) $("pvm").value = todayIso();

    // kmA input (Aloitus km) on yläpalkissa
  const kmInput = $("aloitusKm");
  if (kmInput) {
    kmA = (kmInput.value || "").trim();
    kmInput.addEventListener("change", () => {
      kmA = (kmInput.value || "").trim();
      if (kmA) { lastKm = kmA; updateKmUI(); }
      persist();
    });
  }

// load state
  const saved = loadState();
  if (saved && Array.isArray(saved.rows) && saved.rows.length === ROWS_COUNT) {
    rows = saved.rows;
    if ($("pvm") && saved.pvm) $("pvm").value = saved.pvm;
    if ($("auto") && saved.auto) $("auto").value = saved.auto;
    kmA = saved.kmA || "";
    if ($("aloitusKm")) $("aloitusKm").value = kmA;

    kmB = saved.kmB || "";
    lastKm = saved.lastKm || "";
  } else {
    rows = createEmptyRows();
  }

  updateKmUI();
  initDriverSelect();
  loadSavedLocations();
  renderTable();

  // events
  $("btnLogout")?.addEventListener("click", () => hardLock("Kirjauduttu ulos."));
  TBody()?.addEventListener("click", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const idx = Number(tr.dataset.index);
    if (Number.isFinite(idx)) openModalForIndex(idx);
  });

  $("saveKuormaBtn") && ($("saveKuormaBtn").onclick = saveKuorma);
  $("closeModalBtn") && ($("closeModalBtn").onclick = closeModal);
  $("closeModalBtnX") && ($("closeModalBtnX").onclick = closeModal);
  $("syncFailedBtn") && ($("syncFailedBtn").onclick = sendFailedRows);
  $("finishBtn") && ($("finishBtn").onclick = finishReport);

  // persist on header changes
  ["pvm", "auto"].forEach((id) => {
    $(id)?.addEventListener("change", () => { persist(); });
  });

  // km manual set button
  $("btnSetKm")?.addEventListener("click", () => {
    const v = prompt("Aseta aloituskilometrit kuormille 1–6 (kmA):", kmA || $("aloitusKm")?.value || "");
    if (v == null) return;
    kmA = String(v).trim();
    const kmInput2 = $("aloitusKm");
    if (kmInput2) kmInput2.value = kmA;
    if (kmA) {
      lastKm = kmA;
      updateKmUI();
      persist();
    }
  });
}

window.addEventListener("error", (e) => {
  console.error("JS-virhe:", e?.message || e);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("Promise-virhe:", e?.reason || e);
});

document.addEventListener("DOMContentLoaded", init);
