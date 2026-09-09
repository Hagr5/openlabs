async function loadDashboard() {
  const root = document.getElementById('documents');
  if (!root) return;
  const res = await fetch('/api/me/documents');
  const docs = await res.json();
  root.innerHTML = docs.map(d => `
    <a class="card" href="/documents/${d.id}">
      <div class="tag">${d.classification}</div>
      <h3>${d.title}</h3>
      <p>Record #${d.id}</p>
    </a>
  `).join('');
}

async function loadDocument() {
  const root = document.getElementById('document');
  if (!root) return;

  const id = root.dataset.docId;
  const res = await fetch(`/api/documents/${id}`);
  const data = await res.json();

  if (!res.ok) {
    root.innerHTML = `
      <div class="tag">ERROR</div>
      <h2>Unable to load record</h2>
      <p class="muted">${data.error || 'Unknown error'}</p>
    `;
    return;
  }

  root.innerHTML = `
    <div class="tag">${data.classification}</div>
    <h1>${data.title}</h1>

    <div class="doc-meta">
      <span class="meta-chip">Record #${data.id}</span>
      <span class="meta-chip">Owner: ${data.owner}</span>
      <span class="meta-chip">Source: Document Service</span>
    </div>

    <hr />

    <p>${data.content}</p>
  `;
}

loadDashboard();
loadDocument();
