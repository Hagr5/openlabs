const state = { token: null };

const loginView = document.getElementById('loginView');
const adminLoginView = document.getElementById('adminLoginView');
const adminDashboardView = document.getElementById('adminDashboardView');
const appView = document.getElementById('appView');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const whoami = document.getElementById('whoami');
const progressEl = document.getElementById('progress');

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
    if (btn.dataset.tab === 'security') refreshStatus();
  });
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      loginError.textContent = data.error || 'login failed';
      return;
    }
    state.token = data.token;
    sessionStorage.setItem('aegis_token', data.token);
    enterApp(data.profile);
  } catch (err) {
    loginError.textContent = 'network error';
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  logout();
});

document.getElementById('adminLogoutBtn').addEventListener('click', () => {
  logout();
});

function logout() {
  state.token = null;
  sessionStorage.removeItem('aegis_token');
  appView.classList.add('hidden');
  adminDashboardView.classList.add('hidden');
  adminLoginView.classList.add('hidden');
  loginView.classList.remove('hidden');
  whoami.textContent = '';
}

document.getElementById('showAdminLoginLink').addEventListener('click', (e) => {
  e.preventDefault();
  loginView.classList.add('hidden');
  adminLoginView.classList.remove('hidden');
});

document.getElementById('backToEmployeeLoginLink').addEventListener('click', (e) => {
  e.preventDefault();
  adminLoginView.classList.add('hidden');
  loginView.classList.remove('hidden');
});

document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const adminLoginError = document.getElementById('adminLoginError');
  adminLoginError.textContent = '';
  const password = document.getElementById('adminPassword').value;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password })
    });
    const data = await res.json();
    if (!res.ok) {
      adminLoginError.textContent = data.error || 'login failed';
      return;
    }
    state.token = data.token;
    sessionStorage.setItem('aegis_token', data.token);
    enterAdminDashboard();
  } catch (err) {
    adminLoginError.textContent = 'network error';
  }
});

function enterApp(profile) {
  loginView.classList.add('hidden');
  adminLoginView.classList.add('hidden');
  adminDashboardView.classList.add('hidden');
  appView.classList.remove('hidden');
  whoami.textContent = profile ? `${profile.display_name} (${profile.role})` : '';
  loadProfile();
}

async function enterAdminDashboard() {
  loginView.classList.add('hidden');
  adminLoginView.classList.add('hidden');
  appView.classList.add('hidden');
  adminDashboardView.classList.remove('hidden');
  whoami.textContent = 'Administrator';
  await loadAdminDashboard();
}

async function loadAdminDashboard() {
  const res = await fetch('/api/admin/dashboard', { headers: authHeaders() });
  const data = await res.json();
  document.getElementById('adm-id').textContent = data.employee_id ?? '-';
  document.getElementById('adm-username').textContent = data.username ?? '-';
  document.getElementById('adm-display').textContent = data.display_name ?? '-';
  document.getElementById('adm-department').textContent = data.department ?? '-';

  const admFlagBox = document.getElementById('adm-flagBox');
  const admMessage = document.getElementById('adm-message');
  admMessage.textContent = data.message || '';

  if (data.flag) {
    admFlagBox.classList.remove('hidden');
    admFlagBox.textContent = data.flag;
  } else {
    admFlagBox.classList.add('hidden');
  }
}

async function loadProfile() {
  const res = await fetch('/api/profile', { headers: authHeaders() });
  const data = await res.json();
  document.getElementById('pf-id').textContent = data.employee_id;
  document.getElementById('pf-username').textContent = data.username;
  document.getElementById('pf-display').textContent = data.display_name;
  document.getElementById('pf-department').textContent = data.department;
  document.getElementById('pf-tier').textContent = data.access_tier;
  document.getElementById('pf-role').textContent = data.role;
  document.getElementById('displayNameInput').value = data.display_name || '';
}

document.getElementById('prefsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const prefsMsg = document.getElementById('prefsMsg');
  prefsMsg.textContent = 'Saving...';
  try {
    const res = await fetch('/api/profile/preferences', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: document.getElementById('displayNameInput').value })
    });
    const data = await res.json();
    prefsMsg.textContent = res.ok ? 'Saved.' : (data.error || 'Failed.');
    if (res.ok) loadProfile();
  } catch (err) {
    prefsMsg.textContent = 'Network error.';
  }
});

const PASSWORD_SLOT_ORDER = ['rest', 'graphql', 'grpc'];
// Real fragment lengths, used only to size the underscore placeholder for
// each still-locked slot so the box never visibly resizes or reflows once
// a slot is solved - it just stays the same total length throughout.
const FRAGMENT_LENGTHS = { rest: 5, graphql: 8, grpc: 10 };

async function refreshStatus() {
  try {
    const res = await fetch('/api/status', { headers: authHeaders() });
    const data = await res.json();

    const combined = PASSWORD_SLOT_ORDER
      .map(key => data.fragments[key] || '_'.repeat(FRAGMENT_LENGTHS[key]))
      .join('');
    const passwordBox = document.getElementById('passwordBox');
    passwordBox.value = combined;

    const allSolved = PASSWORD_SLOT_ORDER.every(key => data.fragments[key]);
    const copyBtn = document.getElementById('copyPasswordBtn');
    if (allSolved) {
      copyBtn.classList.remove('hidden');
    } else {
      copyBtn.classList.add('hidden');
    }
  } catch (e) {
    // Silent failure - the box simply keeps its last rendered state.
  }
}

document.getElementById('copyPasswordBtn').addEventListener('click', () => {
  const passwordBox = document.getElementById('passwordBox');
  passwordBox.select();
  navigator.clipboard.writeText(passwordBox.value).catch(() => {
    document.execCommand('copy');
  });
});

function authHeaders() {
  return { Authorization: 'Bearer ' + state.token };
}

// Restore session if a token is already stored for this tab.
const saved = sessionStorage.getItem('aegis_token');
if (saved) {
  state.token = saved;
  fetch('/api/profile', { headers: authHeaders() })
    .then(res => (res.ok ? res.json() : Promise.reject()))
    .then(profile => {
      if (profile.username === 'admin') {
        enterAdminDashboard();
      } else {
        enterApp(profile);
      }
    })
    .catch(() => sessionStorage.removeItem('aegis_token'));
}
