const API_URL = "https://script.google.com/macros/s/AKfycbxpnIV_oVKhm5FMscFRrWVHIO-dYPP722AfPkdtIKb2rGDZH8N3RzserpusobksTe2bBQ/exec";

const ALLOWED_EMAIL = "juha.vilmusenaho2026@gmail.com";

const loginDiv = document.getElementById("login");
const appDiv = document.getElementById("app");

const loginBtn = document.getElementById("loginBtn");
const saveBtn = document.getElementById("saveBtn");

const plate = document.getElementById("plate");
const loadNumber = document.getElementById("loadNumber");
const driver = document.getElementById("driver");
const from = document.getElementById("from");
const to = document.getElementById("to");

init();

function init(){

  const saved = localStorage.getItem("ro_logged");

  if(saved === "true"){
    openApp();
  }

}

loginBtn.onclick = async ()=>{

  const email = prompt("Anna Google sähköposti");

  if(email !== ALLOWED_EMAIL){
    alert("Ei käyttöoikeutta");
    return;
  }

  localStorage.setItem("ro_logged","true");
  localStorage.setItem("ro_email",email);

  openApp();
};

function openApp(){

  loginDiv.style.display="none";
  appDiv.style.display="block";

  getLoadNumber();
}

async function getLoadNumber(){

  const res = await fetch(API_URL + "?action=nextLoadNumber");
  const data = await res.json();

  loadNumber.value = data.loadNumber + 1;
}

saveBtn.onclick = async ()=>{

  const body = {

    email:localStorage.getItem("ro_email"),
    plate:plate.value,
    loadNumber:loadNumber.value,
    driver:driver.value,
    from:from.value,
    to:to.value

  };

  await fetch(API_URL,{
    method:"POST",
    body:JSON.stringify(body)
  });

  alert("Tallennettu");

  getLoadNumber();
};
