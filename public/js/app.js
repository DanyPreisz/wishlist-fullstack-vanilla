import { api, setSession, clearSession, getToken } from "./api.js";
const money = (value) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(value) || 0);
const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const listEl = document.querySelector("#list");
const filtersEl = document.querySelector("#filters");
const form = document.querySelector("#wish-form");
const formError = document.querySelector("#form-error");
let mode = "login";
let filter = "open";
let query = "";
let timer;
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };

function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
function renderFilters() {
  filtersEl.innerHTML = "";
  [["open", "Pendientes"], ["bought", "Comprados"], ["all", "Todos"]].forEach(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab${filter === value ? " active" : ""}`;
    button.textContent = label;
    button.addEventListener("click", async () => { filter = value; await refresh(); });
    filtersEl.append(button);
  });
}
async function refresh() {
  renderFilters();
  const params = new URLSearchParams({ filter });
  if (query) params.set("q", query);
  const data = await api(`/api/wishes?${params}`);
  document.querySelector("#total").textContent = `${data.open} pendientes \u00b7 ${money(data.total)}`;
  listEl.innerHTML = "";
  if (!data.wishes.length) {
    const empty = document.createElement("li");
    empty.textContent = "No hay deseos.";
    listEl.append(empty);
    return;
  }
  data.wishes.forEach((wish) => {
    const li = document.createElement("li");
    li.className = `item${wish.bought ? " bought" : ""}`;
    const text = document.createElement("span");
    text.textContent = `${wish.title} \u00b7 ${money(wish.price)}`;
    const link = document.createElement("a");
    if (wish.url) { link.href = wish.url; link.target = "_blank"; link.rel = "noreferrer"; link.textContent = "Link"; }
    const buy = document.createElement("button");
    buy.type = "button";
    buy.className = "ghost";
    buy.textContent = wish.bought ? "Pendiente" : "Comprado";
    buy.addEventListener("click", async () => { await api(`/api/wishes/${wish.id}`, { method: "PATCH", body: JSON.stringify({ bought: !wish.bought }) }); await refresh(); });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost";
    del.textContent = "Borrar";
    del.addEventListener("click", async () => { await api(`/api/wishes/${wish.id}`, { method: "DELETE" }); await refresh(); });
    li.append(text, link, buy, del);
    listEl.append(li);
  });
}
async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    await refresh();
  } catch { clearSession(); }
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#logout").addEventListener("click", () => { clearSession(); appView.classList.add("hidden"); authView.classList.remove("hidden"); });
document.querySelector("#search").addEventListener("input", (event) => { clearTimeout(timer); timer = setTimeout(async () => { query = event.target.value.trim(); await refresh(); }, 200); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  try {
    await api("/api/wishes", { method: "POST", body: JSON.stringify({ title: document.querySelector("#title").value.trim(), price: document.querySelector("#price").value, url: document.querySelector("#url").value.trim() }) });
    form.reset();
    await refresh();
  } catch (err) { showError(formError, err.message); }
});
boot();
