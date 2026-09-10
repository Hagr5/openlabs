(function () {
  const state = {
    token: sessionStorage.getItem('snapsync_token') || null,
    photos: []
  };

  const el = {
    loginWrap: document.getElementById('loginWrap'),
    appShell: document.getElementById('appShell'),
    sessionInfo: document.getElementById('sessionInfo'),
    roleBadge: document.getElementById('roleBadge'),
    userLabel: document.getElementById('userLabel'),
    authForm: document.getElementById('authForm'),
    authTitle: document.getElementById('authTitle'),
    authHint: document.getElementById('authHint'),
    authBtn: document.getElementById('authBtn'),
    authError: document.getElementById('authError'),
    authToggleLabel: document.getElementById('authToggleLabel'),
    authToggleBtn: document.getElementById('authToggleBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    uploadBtn: document.getElementById('uploadBtn'),
    uploadError: document.getElementById('uploadError'),
    photoList: document.getElementById('photoList'),

    toast: document.getElementById('toast')
  };

  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('visible');
    setTimeout(() => el.toast.classList.remove('visible'), 2200);
  }

  function decodeJwtPayload(token) {
    try {
      const payload = token.split('.')[1];
      const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(b64));
    } catch (e) {
      return null;
    }
  }

  function setError(node, message) {
    if (!message) {
      node.textContent = '';
      node.classList.remove('visible');
      return;
    }
    node.textContent = message;
    node.classList.add('visible');
  }

  function setSession(token) {
    state.token = token;
    if (token) {
      sessionStorage.setItem('snapsync_token', token);
    } else {
      sessionStorage.removeItem('snapsync_token');
    }
    render();
  }

  async function api(path, options = {}) {
    const headers = options.headers || {};
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    const res = await fetch(path, { ...options, headers });
    let body = null;
    try {
      body = await res.json();
    } catch (e) {
      /* no body */
    }
    return { ok: res.ok, status: res.status, body };
  }

  function render() {
    const loggedIn = !!state.token;
    el.loginWrap.style.display = loggedIn ? 'none' : 'flex';
    el.appShell.classList.toggle('visible', loggedIn);
    el.sessionInfo.style.display = loggedIn ? 'flex' : 'none';

    if (loggedIn) {
      const claims = decodeJwtPayload(state.token);
      el.userLabel.textContent = claims?.sub || '';
      el.roleBadge.textContent = claims?.role || 'unknown';
      loadPhotos();
    }
  }

  async function loadPhotos() {
    const { ok, status, body } = await api('/api/photos');
    if (status === 401) {
      setSession(null);
      return;
    }
    if (!ok) return;

    state.photos = body.photos || [];
    renderPhotoList();
  }

  function renderPhotoList() {
    if (state.photos.length === 0) {
      el.photoList.innerHTML = '<div class="empty-state">No photos yet. Upload one to get started.</div>';
      return;
    }

    el.photoList.innerHTML = '';
    for (const photo of state.photos) {
      const row = document.createElement('div');
      row.className = 'photo-row';

      const img = document.createElement('img');
      img.className = 'photo-thumb';
      img.alt = photo.photoId;
      img.src = photo.downloadUrl + '?t=' + Date.now();
      attachAuthedImage(img, photo.downloadUrl);

      const meta = document.createElement('div');
      meta.className = 'photo-meta';
      meta.innerHTML = `
        <div class="photo-id">${photo.photoId}</div>
        <div class="photo-time">${new Date(photo.createdAt).toLocaleString()}</div>
      `;

      const actions = document.createElement('div');
      actions.className = 'photo-actions';
      const dlBtn = document.createElement('button');
      dlBtn.className = 'ghost-btn';
      dlBtn.textContent = 'Download';
      dlBtn.addEventListener('click', () => downloadPhoto(photo.photoId));
      actions.appendChild(dlBtn);

      row.appendChild(img);
      row.appendChild(meta);
      row.appendChild(actions);
      el.photoList.appendChild(row);
    }
  }

  async function attachAuthedImage(imgEl, url) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${state.token}` } });
      if (!res.ok) return;
      const blob = await res.blob();
      imgEl.src = URL.createObjectURL(blob);
    } catch (e) {
      /* leave placeholder */
    }
  }

  async function downloadPhoto(photoId) {
    const res = await fetch(`/api/photos/${photoId}`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    if (!res.ok) {
      showToast('Could not download photo');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${photoId}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---- Sign in / sign up ----
  let authMode = 'login'; // 'login' | 'signup'

  function setAuthMode(mode) {
    authMode = mode;
    setError(el.authError, null);
    if (mode === 'login') {
      el.authTitle.textContent = 'Sign in';
      el.authHint.textContent = 'Use your SnapSync account.';
      el.authBtn.textContent = 'Sign in';
      el.authToggleLabel.textContent = "Don't have an account?";
      el.authToggleBtn.textContent = 'Create one';
    } else {
      el.authTitle.textContent = 'Create account';
      el.authHint.textContent = 'Username: 3-32 characters. Password: at least 8 characters.';
      el.authBtn.textContent = 'Create account';
      el.authToggleLabel.textContent = 'Already have an account?';
      el.authToggleBtn.textContent = 'Sign in';
    }
  }

  el.authToggleBtn.addEventListener('click', () => {
    setAuthMode(authMode === 'login' ? 'signup' : 'login');
  });

  el.authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError(el.authError, null);
    el.authBtn.disabled = true;
    el.authBtn.textContent = authMode === 'login' ? 'Signing in…' : 'Creating account…';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const { ok, body } = await api(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    el.authBtn.disabled = false;
    el.authBtn.textContent = authMode === 'login' ? 'Sign in' : 'Create account';

    if (!ok || !body?.token) {
      setError(el.authError, body?.message || 'Request failed.');
      return;
    }

    setSession(body.token);
  });

  el.logoutBtn.addEventListener('click', () => setSession(null));

  setAuthMode('login');

  // ---- Upload ----
  el.dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.dropzone.classList.add('drag');
  });
  el.dropzone.addEventListener('dragleave', () => el.dropzone.classList.remove('drag'));
  el.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    el.dropzone.classList.remove('drag');
    if (e.dataTransfer.files.length) {
      el.fileInput.files = e.dataTransfer.files;
    }
  });

  el.uploadBtn.addEventListener('click', async () => {
    setError(el.uploadError, null);
    const file = el.fileInput.files[0];
    if (!file) {
      setError(el.uploadError, 'Choose a JPEG file first.');
      return;
    }

    const formData = new FormData();
    formData.append('photo', file);

    el.uploadBtn.disabled = true;
    el.uploadBtn.textContent = 'Uploading…';

    const { ok, body } = await api('/api/photos/upload', {
      method: 'POST',
      body: formData
    });

    el.uploadBtn.disabled = false;
    el.uploadBtn.textContent = 'Upload';

    if (!ok) {
      setError(el.uploadError, body?.message || 'Upload failed.');
      return;
    }

    el.fileInput.value = '';
    showToast('Photo uploaded and processed');
    loadPhotos();
  });

  render();
})();
