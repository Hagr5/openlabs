let token = sessionStorage.getItem("northstar_token");
const activity = document.querySelector("#api");
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const data = await response.json(); activity.textContent = `${options.method || "GET"} ${path}\n${response.status}\n${JSON.stringify(data, null, 2)}`;
  if (!response.ok) throw new Error(data.error || "Request failed"); return data;
}
async function loadWorkspace() {
  const [me, docs, announcements] = await Promise.all([api("/api/me"), api("/api/documents"), api("/api/announcements")]);
  document.querySelector("#identity").textContent = me.user.name;
  document.querySelector("#documents").innerHTML = docs.documents.map(d => `<div class="row"><span><strong>${d.title}</strong><br><span class="muted">${d.id} · ${d.classification}</span></span><button data-doc="${d.id}">View</button></div>`).join("");
  document.querySelector("#announcements").innerHTML = announcements.announcements.map(a => `<div class="row"><span><strong>${a.title}</strong><br>${a.message}</span></div>`).join("");
  document.querySelectorAll("[data-doc]").forEach(button => button.onclick = () => api(`/api/documents/${button.dataset.doc}`).catch(showError));
  document.querySelector("#login").hidden = true; document.querySelector("#workspace").hidden = false;
}
function showError(error) { document.querySelector("#error").textContent = error.message; }
document.querySelector("#loginForm").onsubmit = async event => { event.preventDefault(); try { const result = await api("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.value, password: password.value }) }); token = result.token; sessionStorage.setItem("northstar_token", token); await loadWorkspace(); } catch (error) { showError(error); } };
if (token) loadWorkspace().catch(() => { sessionStorage.removeItem("northstar_token"); token = null; });
