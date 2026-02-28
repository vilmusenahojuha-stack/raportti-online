// ===============================
// Raportti Online – script.js (v3.1)
// Päivitykset tähän versioon:
// - Ehdottaa kuluvaa päivää modalissa (lastaus/purku pvm) kun avaat rivin
// - Muistaa edellisen lastaus- ja purkupaikan (prefill) + listat datalisteihin
// - Kuljettajat valikossa (muistettava lista + "Lisää uusi…")
// - Kuorma 6 kysyy KM:n AINA avattaessa
// - Sheetsiin lähetetään aloitusKm jokaiselle kuormalle
// ===============================

// CONFIG
const ALLOWED_EMAIL = "juha.vilmusenaho2026@gmail.com";
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbzxFeMmvmg9YD7izZR6zwcyGLd82p2mfI6_s29WILdnHmmpRH4DLWTOTaMii78w899Z5A/exec"; // <-- paste your /exec URL after Apps Script deploy

// localStorage keys
const LS_TOKEN = "kr_idtoken_v3";
const LS_EMAIL = "kr_email_v3";
const LS_STATE = "kr_state_v6";

const LS_LASTAUS_LIST = "kr_lastausList_v6";
const LS_PURKU_LIST  = "kr_purkuList_v6";
const LS_PRODUCTS    = "kr_products_v2";
const LS_DRIVERS     = "kr_driverList_v6";

const LS_LAST_LASTAUS = "kr_last_lastaus_v6";
const LS_LAST_PURKU   = "kr_last_purku_v6";
const LS_LAST_DRIVER  = "kr_last_driver_v6";

const ROWS_COUNT = 12;

let googleIdToken = null;
let loggedInEmail = null;

function $(id){ return document.getElementById(id); }

function nowIsoDate(){
  const d = new Date();
  const pad=(n)=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function status(msg, type=""){
  const el = $("statusMsg");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "status " + (type ? ("status-" + type) : "");
}

function authStatus(msg){
  const el = $("authStatus");
  if (!el) return;
  el.textContent = msg || "";
}

function lockApp(isLocked){
  const app = $("appRoot");
  if (!app) return;
  if (isLocked) app.classList.add("app-locked");
  else app.classList.remove("app-locked");
}

function setAuthVisible(isAuthed){
  const auth = $("authBox");
  const app = $("appRoot");
  if (auth) auth.style.display = isAuthed ? "none" : "block";
  if (app) app.style.display = isAuthed ? "block" : "none";
}

// ---------- STATE ----------
const DEFAULT_STATE = () => ({
  pvm: nowIsoDate(),
  auto: "",
  kmA: "",    // kuormat 1–6
  kmB: "",    // kuormat 7–12
  lastKm: "", // viimeisin syötetty
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

function loadState(){
  try{
    const raw = localStorage.getItem(LS_STATE);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.rows) || obj.rows.length !== ROWS_COUNT) return;
    state = obj;
  }catch{}
}

function saveState(){
  try{ localStorage.setItem(LS_STATE, JSON.stringify(state)); }catch{}
}

function setKmValueUI(){
  const el = $("kmValue");
  if (!el) return;
  el.textContent = state.lastKm ? String(state.lastKm) : "—";
}

function normalizeList_(arr){
  const out = [];
  const seen = new Set();
  (arr || []).forEach(v=>{
    const s = String(v||"").trim();
    if (!s) return;
    const key = s.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  });
  return out;
}

function getList_(key, fallback=[]){
  try{
    const raw = localStorage.getItem(key);
    if (!raw) return fallback.slice();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return fallback.slice();
    return normalizeList_(arr);
  }catch{
    return fallback.slice();
  }
}

function setList_(key, arr){
  try{ localStorage.setItem(key, JSON.stringify(normalizeList_(arr))); }catch{}
}

function addToList_(key, value){
  const s = String(value||"").trim();
  if (!s) return;
  const list = getList_(key, []);
  list.unshift(s); // viimeisin ensin
  setList_(key, list);
}

function renderDatalist_(datalistId, items){
  const dl = $(datalistId);
  if (!dl) return;
  dl.innerHTML = "";
  (items||[]).slice(0, 80).forEach(v=>{
    const opt = document.createElement("option");
    opt.value = v;
    dl.appendChild(opt);
  });
}

function getDrivers_(){
  return getList_(LS_DRIVERS, ["Juha","Tommi","Janne"]);
}

function setDrivers_(arr){
  setList_(LS_DRIVERS, arr);
}

function renderDriverSelect(){
  const sel = $("kuljettaja");
  if (!sel) return;

  const drivers = getDrivers_();
  sel.innerHTML = "";

  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "Valitse…";
  sel.appendChild(ph);

  drivers.forEach(n=>{
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    sel.appendChild(opt);
  });

  const add = document.createElement("option");
  add.value = "__add__";
  add.textContent = "Lisää uusi…";
  sel.appendChild(add);
}

function bindDriverAdd(){
  const sel = $("kuljettaja");
  if (!sel) return;

  sel.addEventListener("change", ()=>{
    if (sel.value !== "__add__") return;

    const name = prompt("Uusi kuljettaja:");
    const prev = localStorage.getItem(LS_LAST_DRIVER) || "";
    if (name === null) { sel.value = prev; return; }

    const clean = String(name||"").trim();
    if (!clean) { sel.value = prev; return; }

    const drivers = getDrivers_();
    drivers.unshift(clean);
    setDrivers_(drivers);
    renderDriverSelect();
    sel.value = clean;
    localStorage.setItem(LS_LAST_DRIVER, clean);
  });
}

function initListsUI(){
  renderDatalist_("lastausList", getList_(LS_LASTAUS_LIST, []));
  renderDatalist_("purkuList", getList_(LS_PURKU_LIST, []));
  renderDatalist_("tuoteList", getList_(LS_PRODUCTS, []));
  renderDriverSelect();
}

// ---------- AUTH (GIS callback from HTML data-callback) ----------
function handleCredentialResponse(response){
  try{
    const token = response && response.credential;
    if (!token) return hardLock("Kirjautuminen epäonnistui.");

    const payload = JSON.parse(atob(token.split(".")[1]));
    const email = String(payload.email || "").toLowerCase();
    if (email !== ALLOWED_EMAIL.toLowerCase()){
      hardLock("Ei oikeuksia tälle sähköpostille.");
      return;
    }

    googleIdToken = token;
    loggedInEmail = email;
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem(LS_EMAIL, email);

    $("pillUser").textContent = email;

    authStatus("Kirjautunut: " + email);
    setAuthVisible(true);
    lockApp(false);
    initAfterAuth();
  }catch(e){
    hardLock("Kirjautuminen epäonnistui.");
  }
}
window.handleCredentialResponse = handleCredentialResponse; // GIS tarvitsee globaalin nimen

function hardLock(reason){
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_EMAIL);
  googleIdToken = null;
  loggedInEmail = null;
  lockApp(true);
  setAuthVisible(false);
  authStatus(reason || "Kirjaudu sisään.");
}

function tryResumeSession(){
  const token = localStorage.getItem(LS_TOKEN);
  const email = localStorage.getItem(LS_EMAIL);
  if (token && email && String(email).toLowerCase() === ALLOWED_EMAIL.toLowerCase()){
    googleIdToken = token;
    loggedInEmail = email;
    $("pillUser").textContent = email;

    authStatus("Kirjautunut: " + email);
    setAuthVisible(true);
    lockApp(false);
    initAfterAuth();
    return true;
  }
  return false;
}

// ---------- UI ----------
function renderTable(){
  const tbody = document.querySelector("#raportti tbody");
  if (!tbody) return;

  tbody.innerHTML = "";
  state.rows.forEach(row=>{
    const tr = document.createElement("tr");
    tr.className = "row-" + row.status;
    tr.addEventListener("click", ()=>openRow(row.index));

    const d = row.data || {};

    const cols = [
      row.index,
      row.loadNo ? String(row.loadNo) : "",
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
      (row.status === "ok" ? "Tallennettu" :
       row.status === "sending" ? "Lähettää…" :
       row.status === "fail" ? "Virhe" : "")
    ];

    cols.forEach(v=>{
      const td = document.createElement("td");
      td.textContent = String(v);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

function bindTopControls(){
  $("btnLogout")?.addEventListener("click", ()=>{
    hardLock("Kirjauduttu ulos.");
    location.reload();
  });

  $("pvm")?.addEventListener("change", ()=>{
    state.pvm = $("pvm").value || nowIsoDate();
    saveState();
  });

  $("auto")?.addEventListener("change", ()=>{
    state.auto = $("auto").value.trim();
    saveState();
  });

  $("btnSetKm")?.addEventListener("click", ()=>{
    const v = prompt("Aseta aloitus km (viimeisin):", state.lastKm || "");
    if (v === null) return;
    const n = String(v).trim();
    if (!n) return;
    state.lastKm = n;
    saveState();
    setKmValueUI();
  });

  $("finishBtn")?.addEventListener("click", finishReport);
}

function bindModal(){
  $("closeModalBtnX")?.addEventListener("click", closeModal);
  $("saveKuormaBtn")?.addEventListener("click", saveActiveRow);
  bindDriverAdd();
}

function initAfterAuth(){
  loadState();

  // defaults: kuluva päivä ehdotukseksi
  $("pvm").value = state.pvm || nowIsoDate();
  $("auto").value = state.auto || "";

  initListsUI();
  setKmValueUI();

  renderTable();
  bindTopControls();
  bindModal();

  fetchNextLoadNumber();
}

function setModalTitle_(txt){
  const h2 = document.querySelector("#modal .modal-head h2");
  if (h2) h2.textContent = txt;
}

function openRow(idx){
  activeRowIndex = idx;

  // Kuorma 6: kysy KM AINA avattaessa
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

  const row = state.rows[idx-1];
  if (!row) return;

  $("modal").classList.remove("hidden");
  setModalTitle_(`Kuorma ${idx}`);

  const d = row.data || {};
  const today = state.pvm || nowIsoDate();

  $("r2").value = d.r2 || "";
  $("rahti").value = d.rahti || "";

  // Päiväehdotus: jos tyhjä, käytä tämän raportin pvm (tai tänään)
  $("lastausPvm").value = d.lastausPvm || today;
  $("purkuPvm").value = d.purkuPvm || today;

  // Paikkamuisti: jos tyhjä, käytä edellistä
  const lastL = localStorage.getItem(LS_LAST_LASTAUS) || "";
  const lastP = localStorage.getItem(LS_LAST_PURKU) || "";
  $("lastausPaikka").value = d.lastausPaikka || lastL;
  $("purkuPaikka").value = d.purkuPaikka || lastP;

  // Kuljettajamuisti
  const lastD = localStorage.getItem(LS_LAST_DRIVER) || "";
  $("kuljettaja").value = d.kuljettaja || lastD || "";

  $("maara").value = d.maara || "";
  $("tonnit").value = d.tonnit || "";
  $("tuote").value = d.tuote || "";

  status("");
}

function closeModal(){
  $("modal").classList.add("hidden");
  activeRowIndex = null;
}

// ---------- KM LOGIC ----------
function kmForRow_(idx){ return idx <= 6 ? state.kmA : state.kmB; }

function requireKmForRow(idx){
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

// ---------- SHEETS API ----------
async function fetchNextLoadNumber(){
  if (!SHEETS_URL || SHEETS_URL.includes("PASTE_")) return;
  try{
    const url = SHEETS_URL + (SHEETS_URL.includes("?") ? "&" : "?") + "action=nextLoadNumber";
    const res = await fetch(url, { method:"GET" });
    const j = await res.json();
    if (j && j.ok && j.nextLoadNumber) {
      state.nextLoadNumber = Number(j.nextLoadNumber);
      saveState();
    }
  }catch{}
}

async function sendRowToSheets(payload){
  const res = await fetch(SHEETS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  const txt = await res.text();
  try{ return JSON.parse(txt); }catch{ return txt; }
}

// ---------- SAVE ----------
async function saveActiveRow(){
  if (!activeRowIndex) return;

  const idx = activeRowIndex;
  const row = state.rows[idx-1];
  if (!row) return;

  // validate header fields
  const pvm = $("pvm").value || nowIsoDate();
  const auto = $("auto").value.trim();
  if (!auto) { status("Lisää rekisterinumero ylhäältä.", "fail"); return; }

  state.pvm = pvm;
  state.auto = auto;

  // KM required
  if (!requireKmForRow(idx)) { status("Aloitus km puuttuu.", "fail"); return; }

  // collect
  const d = row.data || {};
  d.r2 = $("r2").value.trim();
  d.rahti = $("rahti").value.trim();
  d.lastausPvm = $("lastausPvm").value || pvm;
  d.lastausPaikka = $("lastausPaikka").value.trim();
  d.purkuPvm = $("purkuPvm").value || pvm;
  d.purkuPaikka = $("purkuPaikka").value.trim();
  d.kuljettaja = $("kuljettaja").value.trim();
  d.maara = $("maara").value.trim();
  d.tonnit = $("tonnit").value.trim();
  d.tuote = $("tuote").value.trim();
  row.data = d;

  // remember last selections
  if (d.lastausPaikka) localStorage.setItem(LS_LAST_LASTAUS, d.lastausPaikka);
  if (d.purkuPaikka) localStorage.setItem(LS_LAST_PURKU, d.purkuPaikka);
  if (d.kuljettaja) localStorage.setItem(LS_LAST_DRIVER, d.kuljettaja);

  // update lists + UI
  if (d.lastausPaikka) addToList_(LS_LASTAUS_LIST, d.lastausPaikka);
  if (d.purkuPaikka) addToList_(LS_PURKU_LIST, d.purkuPaikka);
  if (d.tuote) addToList_(LS_PRODUCTS, d.tuote);

  initListsUI(); // refresh datalists + driver select

  // allocate load number locally (best effort)
  if (!row.loadNo && state.nextLoadNumber) {
    row.loadNo = state.nextLoadNumber;
    state.nextLoadNumber = state.nextLoadNumber + 1;
  }

  saveState();
  renderTable();

  if (!SHEETS_URL || SHEETS_URL.includes("PASTE_")) {
    row.status = "fail";
    saveState();
    renderTable();
    status("SHEETS_URL puuttuu (aseta /exec-osoite script.js:ään).", "fail");
    return;
  }

  // send
  row.status = "sending";
  saveState();
  renderTable();
  status("Lähettää…", "wait");

  const payload = {
    idToken: googleIdToken,
    email: loggedInEmail,
    pvm,
    auto,
    aloitusKm: kmForRow_(idx),
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

  const resp = await sendRowToSheets(payload);
  const err = (resp && typeof resp === "object") ? String(resp.error || "") : "";
  if (err === "invalid_token" || err === "aud_mismatch" || err === "forbidden_email") {
    hardLock("Kirjautuminen vanhentui. Kirjaudu uudelleen.");
    return;
  }

  if ((resp && typeof resp === "object" && resp.ok) || resp === "OK") {
    row.status = "ok";
    if (resp && typeof resp === "object" && resp.loadNo) row.loadNo = resp.loadNo;
    status("Tallennettu ✔", "ok");
    fetchNextLoadNumber();
    closeModal();
  } else {
    row.status = "fail";
    status("Tallennus epäonnistui.", "fail");
  }

  saveState();
  renderTable();
}

function finishReport(){
  const ok = confirm("Päätetäänkö raportti? Tämä tyhjentää rivit (ei poista Sheetsistä).");
  if (!ok) return;

  state = DEFAULT_STATE();
  state.pvm = nowIsoDate();
  saveState();

  $("pvm").value = state.pvm;
  $("auto").value = "";
  setKmValueUI();
  renderTable();
  status("Uusi raportti aloitettu.", "ok");

  fetchNextLoadNumber();
}

// ---------- BOOT ----------
(function boot(){
  // Jos kirjautuminen on jo tallessa, avaa suoraan app.
  tryResumeSession();

  // Jos ei ole sessiota, GIS-nappi toimii index.html:n data-atribuutilla.
  // (GIS kutsuu window.handleCredentialResponse automaattisesti.)
})();
