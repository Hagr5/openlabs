async function fetchJson(url) {
  const res = await fetch(url, { credentials: "same-origin" });
  if (res.status === 401) {
    window.location.href = "/";
    return null;
  }
  if (!res.ok) {
    throw new Error("request failed with status " + res.status);
  }
  return res.json();
}

function fillDemoCredentials() {
  const u = document.getElementById("username");
  const p = document.getElementById("password");
  if (u) u.value = "demo@acme-hvac.example";
  if (p) p.value = "Demo1234!";
  if (u) u.focus();
}

// Admin console integration — pending SSO migration (TRACK-1142).
// Re-enable once platform-admin SSO rollout completes.
//
// async function loadTechnicians() {
//   const data = await fetchJson("/Admin/GetTechnicians");
//   renderTechnicianTable(data.technicians);
// }
//
// function exportJobs() {
//   window.location.href = "/Admin/Export/ExportJobs?format=csv";
// }
