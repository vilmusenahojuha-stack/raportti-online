// ===============================
// CONFIG
const ALLOWED_EMAIL = "juha.vilmusenaho2026@gmail.com";
const CLIENT_ID = "767469865393-5m24jc369g65fh5d51mcu1moocjd27r9.apps.googleusercontent.com";
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbzxFeMmvmg9YD7izZR6zwcyGLd82p2mfI6_s29WILdnHmmpRH4DLWTOTaMii78w899Z5A/exec"; // <-- paste your /exec URL after Apps Script deploy
// ===============================

const LS_TOKEN = "kr_idtoken_v3";
const LS_EMAIL = "kr_email_v3";
const LS_STATE = "kr_state_v5";
const LS_PRODUCTS = "kr_products_v1";

const ROWS_COUNT = 12;

let googleIdToken = null;
let loggedInEmail = null;

function $(id) { return document.getElementById(id); }
function nowIsoDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function lockApp(isLocked) {
  const app = $("appRoot");
  if (!app) return;
  if (isLocked) app.classList.add("app-locked");
  else app.classList.remove("app-locked");
}

function setAuthVisible(isAuthed) {
  const auth = $("authBox");
  const app = $("appRoot");
  if (auth) auth.style.display = isAuthed ? "none" : "block";
  if (app) app.style.display = isAuthed ? "block" : "none";
}

function status(msg, type="") {
  const el = $("statusMsg");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "status " + (type ? ("status-" + type) : "");
}

function authStatus(msg) {
  const el = $("authStatus");
  if (!el) return;
  el.textContent = msg || "";
}

function hardLock(reason) {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_EMAIL);
  googleIdToken = null;
  loggedInEmail = null;
  lockApp(true);
  setAuthVisible(false);
  authStatus(reason || "Kirjaudu sisään.");
}

// ---------- STATE ----------
const DEFAULT_STATE = () => ({
  pvm: nowIsoDate(),
  auto: "",
  kmA: "",          // kuormat 1–6 aloituskm
  kmB: "",          // kuormat 7–12 aloituskm
  lastKm: "",       // viimeisin syötetty km (yläpalkki)
  nextLoadNumber: null,
  rows: Array.from({length: ROWS_COUNT}, (_, i) => ({
    index: i + 1,
    status: "empty", // empty|sending|ok|fail
    loadNo: null,
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
      tuote: ""
    }
  }))
});

let state = DEFAULT_STATE();
let activeRowIndex = null;

function loadState() {
  try {
    const raw = localStorage.getItem(LS_STATE);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.rows) || obj.rows.length !== ROWS_COUNT) return;
    state = obj;
  } catch {}
}

function saveState() {
  localStorage.setItem(LS_STATE, JSON.stringify(state));
}

function setKmValueUI() {
  const kmEl = $("kmValue");
  if (kmEl) kmEl.textContent = state.lastKm ? String(state.lastKm) : "—";
  const kmInput = $("aloitusKm");
  if (kmInput) kmInput.value = state.lastKm ? String(state.lastKm) : "";
}

function getProducts() {
  try { return JSON.parse(localStorage.getItem(LS_PRODUCTS) || "[]") || []; }
  catch { return []; }
}
function setProducts(arr) {
  const uniq = Array.from(new Set((arr || []).map(s => String(s||"").trim()).filter(Boolean)));
  localStorage.setItem(LS_PRODUCTS, JSON.stringify(uniq));
  renderProductDatalist();
}
function addProduct(p) {
  const v = String(p||"").trim();
  if (!v) return;
  const arr = getProducts();
  if (!arr.includes(v)) arr.unshift(v);
  setProducts(arr.slice(0, 50));
}
function renderProductDatalist() {
  const dl = $("tuoteList");
  if (!dl) return;
  const arr = getProducts();
  dl.innerHTML = arr.map(x => `<option value="${escapeHtml(x)}"></option>`).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- GOOGLE SIGN-IN ----------
window.handleCredentialResponse = function handleCredentialResponse(response) {
  try {
    const token = response.credential;
    if (!token) return hardLock("Kirjautuminen epäonnistui.");

    // client-side email check (no security, but good UX)
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const email = String(payload.email || "");

    if (email !== ALLOWED_EMAIL) return hardLock("Väärä käyttäjä.");

    googleIdToken = token;
    loggedInEmail = email;
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem(LS_EMAIL, email);

    authStatus("Kirjautunut: " + email);
    setAuthVisible(true);
    lockApp(false);

    initAfterAuth();
  } catch (e) {
    hardLock("Kirjautuminen epäonnistui.");
  }
};

function restoreSession() {
  const tok = localStorage.getItem(LS_TOKEN);
  const em = localStorage.getItem(LS_EMAIL);
  if (tok && em && em === ALLOWED_EMAIL) {
    googleIdToken = tok;
    loggedInEmail = em;
    setAuthVisible(true);
    lockApp(false);
    initAfterAuth();
  } else {
    hardLock("Kirjaudu sisään.");
  }
}

// ---------- UI ----------
function renderTable() {
  const tbody = $("raportti")?.querySelector("tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  state.rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.dataset.idx = String(row.index);

    const d = row.data || {};
    const cells = [
      row.index,
      row.loadNo ? row.loadNo : "",
      d.r2 || "",
      d.rahti || "",
      d.lastausPvm || "",
      d.lastausPaikka || "",
      d.purkuPvm || "",
      d.purkuPaikka || "",
      d.kuljettaja || "",
      d.maara || "",
      d.tonnit || "",
      d.tuote || "",
      row.status || "empty",
    ];

    cells.forEach((v, i) => {
      const td = document.createElement("td");
      td.textContent = (v === null || v === undefined) ? "" : String(v);
      if (i === cells.length - 1) td.className = "status-" + (row.status || "empty");
      tr.appendChild(td);
    });

    tr.addEventListener("click", () => openRow(row.index));
    tbody.appendChild(tr);
  });

  saveState();
}

function bindTopControls() {
  $("pvm")?.addEventListener("change", (e) => {
    state.pvm = e.target.value;
    saveState();
  });
  $("auto")?.addEventListener("input", (e) => {
    state.auto = e.target.value;
    saveState();
  });

  $("btnSetKm")?.addEventListener("click", () => {
    const v = prompt("Aloitus km (päivitä viimeisin km):", state.lastKm || "");
    if (v === null) return;
    const n = String(v).trim();
    if (!n) return;
    // Päivitä "viimeisin km" + jos halutaan, voidaan valita mihin jaksoon se kuuluu – nyt vain lastKm.
    state.lastKm = n;
    saveState();
    setKmValueUI();
  });

  $("syncFailedBtn")?.addEventListener("click", syncFailedRows);
  $("finishBtn")?.addEventListener("click", finishReport);
}

function initAfterAuth() {
  loadState();

  // init defaults
  $("pvm").value = state.pvm || nowIsoDate();
  $("auto").value = state.auto || "";

  renderProductDatalist();
  setKmValueUI();

  renderTable();
  bindTopControls();
  bindModal();

  // fetch next load number
  fetchNextLoadNumber();
}

function bindModal() {
  $("closeModalBtn")?.addEventListener("click", closeModal);
  $("saveKuormaBtn")?.addEventListener("click", saveActiveRow);
}

function openRow(idx) {
  activeRowIndex = idx;

  // Kuorma 6: kysy km AINA avattaessa (tämä määrittää kmB jaksolle 7–12)
  if (idx === 6) {
    const v = prompt("Aloitus km (kuormat 7–12):", state.kmB || state.lastKm || "");
    if (v !== null) {
      const n = String(v).trim();
      if (n) {
        state.kmB = n;
        state.lastKm = n;
        saveState();
        setKmValueUI();
      }
    }
  }

  const row = state.rows[idx - 1];
  if (!row) return;

  // fill modal fields
  $("modal").classList.remove("hidden");
  $("modalTitle").textContent = `Kuorma ${idx}`;

  const d = row.data || {};
  $("r2").value = d.r2 || "";
  $("rahti").value = d.rahti || "";
  $("lastausPvm").value = d.lastausPvm || "";
  $("lastausPaikka").value = d.lastausPaikka || "";
  $("purkuPvm").value = d.purkuPvm || "";
  $("purkuPaikka").value = d.purkuPaikka || "";
  $("kuljettaja").value = d.kuljettaja || "";
  $("maara").value = d.maara || "";
  $("tonnit").value = d.tonnit || "";
  $("tuote").value = d.tuote || "";

  status("");
}

function closeModal() {
  $("modal").classList.add("hidden");
  activeRowIndex = null;
}

// ---------- KM LOGIC ----------
function requireKmForRow(idx) {
  // Rows 1–6 use kmA; rows 7–12 use kmB
  if (idx <= 6) {
    if (!state.kmA) {
      const v = prompt("Lisää aloitus km (kuormat 1–6):", state.lastKm || "");
      if (v === null) return false;
      const n = String(v).trim();
      if (!n) return false;
      state.kmA = n;
      state.lastKm = n;
      saveState();
      setKmValueUI();
    }
    return true;
  } else {
    if (!state.kmB) {
      const v = prompt("Lisää aloitus km (kuormat 7–12):", state.lastKm || "");
      if (v === null) return false;
      const n = String(v).trim();
      if (!n) return false;
      state.kmB = n;
      state.lastKm = n;
      saveState();
      setKmValueUI();
    }
    return true;
  }
}

function kmForRow(idx) {
  return idx <= 6 ? state.kmA : state.kmB;
}

// ---------- SAVE ----------
async function saveActiveRow() {
  const idx = activeRowIndex;
  if (!idx) return;

  if (!state.auto || !String(state.auto).trim()) {
    alert("Lisää rekisterinumero (Auto).");
    return;
  }
  if (!state.pvm || !String(state.pvm).trim()) {
    alert("Lisää päivämäärä (Pvm).");
    return;
  }

  // Kuorma 1: pakota kmA jos puuttuu
  // Kuorma 6: kmB kysytään avauksessa, mutta varmistetaan myös tallennuksessa
  if (!requireKmForRow(idx)) return;

  const row = state.rows[idx - 1];
  const d = row.data || {};
  d.r2 = $("r2").value.trim();
  d.rahti = $("rahti").value.trim();
  d.lastausPvm = $("lastausPvm").value.trim();
  d.lastausPaikka = $("lastausPaikka").value.trim();
  d.purkuPvm = $("purkuPvm").value.trim();
  d.purkuPaikka = $("purkuPaikka").value.trim();
  d.kuljettaja = $("kuljettaja").value.trim();
  d.maara = $("maara").value.trim();
  d.tonnit = $("tonnit").value.trim();
  d.tuote = $("tuote").value.trim();
  row.data = d;

  addProduct(d.tuote);

  // send to sheets
  row.status = "sending";
  renderTable();

  try {
    const body = {
      idToken: googleIdToken,
      email: loggedInEmail,
      pvm: state.pvm,
      auto: state.auto,
      aloitusKm: kmForRow(idx),
      rowIndex: idx,
      r2: d.r2,
      rahti: d.rahti,
      lastausPvm: d.lastausPvm,
      lastausPaikka: d.lastausPaikka,
      purkuPvm: d.purkuPvm,
      purkuPaikka: d.purkuPaikka,
      kuljettaja: d.kuljettaja,
      maara: d.maara,
      tonnit: d.tonnit,
      tuote: d.tuote
    };

    const res = await fetch(SHEETS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    });

    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}

    if (!res.ok) throw new Error(text || ("HTTP " + res.status));

    if (json && json.ok === false) {
      const err = String(json.error || "");
      if (["invalid_token","forbidden_email","aud_mismatch","no_email_in_token"].includes(err)) {
        hardLock("Kirjautuminen vanhentui. Kirjaudu uudelleen.");
        return;
      }
      throw new Error(err || "Tallennus epäonnistui");
    }

    // success
    row.status = "ok";
    if (json && json.loadNo) row.loadNo = json.loadNo;
    status(`Tallennettu kuorma ${idx}.`, "ok");
    saveState();
    renderTable();
    closeModal();

    // refresh next number occasionally
    fetchNextLoadNumber();
  } catch (e) {
    row.status = "fail";
    status("Tallennus epäonnistui: " + (e?.message || e), "fail");
    saveState();
    renderTable();
  }
}

async function syncFailedRows() {
  const failed = state.rows.filter(r => r.status === "fail");
  if (!failed.length) { status("Ei epäonnistuneita rivejä.", "ok"); return; }
  status(`Lähetetään ${failed.length} epäonnistunutta...`, "wait");
  for (const r of failed) {
    activeRowIndex = r.index;
    // openRow would prompt km6; we avoid that here. Ensure km exists:
    if (!requireKmForRow(r.index)) continue;
    // send without opening modal
    try {
      r.status = "sending";
      renderTable();
      const d = r.data || {};
      const body = {
        idToken: googleIdToken,
        email: loggedInEmail,
        pvm: state.pvm,
        auto: state.auto,
        aloitusKm: kmForRow(r.index),
        rowIndex: r.index,
        r2: d.r2 || "",
        rahti: d.rahti || "",
        lastausPvm: d.lastausPvm || "",
        lastausPaikka: d.lastausPaikka || "",
        purkuPvm: d.purkuPvm || "",
        purkuPaikka: d.purkuPaikka || "",
        kuljettaja: d.kuljettaja || "",
        maara: d.maara || "",
        tonnit: d.tonnit || "",
        tuote: d.tuote || ""
      };
      const res = await fetch(SHEETS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body)
      });
      const text = await res.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      if (!res.ok) throw new Error(text || ("HTTP " + res.status));
      if (json && json.ok === false) throw new Error(json.error || "fail");
      r.status = "ok";
      if (json && json.loadNo) r.loadNo = json.loadNo;
      renderTable();
    } catch {
      r.status = "fail";
      renderTable();
    }
  }
  status("Synkronointi valmis.", "ok");
  activeRowIndex = null;
}

function finishReport() {
  const ok = confirm("Päätetäänkö raportti? Tämä tyhjentää rivit.");
  if (!ok) return;

  // uuteen raporttiin: tyhjennä rivit, mutta pidä pvm ja auto, ja siirrä kmB -> kmA jos halutaan? 
  // Tässä pidetään kmA/kmB, mutta voit halutessasi nollata kmB.
  state.rows = DEFAULT_STATE().rows;
  state.kmA = "";
  state.kmB = "";
  // lastKm jätetään näkyviin (viimeisin tallennettu km)
  saveState();
  renderTable();
  status("Raportti nollattu.", "ok");
}

async function fetchNextLoadNumber() {
  if (!SHEETS_URL || SHEETS_URL.includes("PASTE_YOUR")) return;
  try {
    const url = SHEETS_URL + (SHEETS_URL.includes("?") ? "&" : "?") + "action=nextLoadNumber";
    const res = await fetch(url, { method: "GET" });
    const txt = await res.text();
    const j = JSON.parse(txt);
    if (j && j.ok && j.nextLoadNumber) {
      state.nextLoadNumber = j.nextLoadNumber;
      saveState();
    }
  } catch {}
}

// ---------- START ----------
window.addEventListener("load", () => {
  // quick error trap
  window.addEventListener("error", (e) => {
    console.error(e);
  });
  window.addEventListener("unhandledrejection", (e) => {
    console.error(e);
  });

  // modal title element might be missing in old HTML; create if absent
  if (!$("modalTitle")) {
    const h = document.createElement("h3");
    h.id = "modalTitle";
    h.textContent = "Kuorma";
    const form = $("modal")?.querySelector(".modal-content");
    if (form) form.insertBefore(h, form.firstChild);
  }

  restoreSession();
});
