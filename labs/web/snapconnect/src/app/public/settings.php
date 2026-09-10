<?php

declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0e0e10">
<title>Edit profile — SnapConnect</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%23c8f830'/%3E%3Ccircle cx='16' cy='16' r='7' fill='none' stroke='%23151a04' stroke-width='3'/%3E%3Ccircle cx='22' cy='10' r='3' fill='%23151a04'/%3E%3C/svg%3E">
<link rel="stylesheet" href="/assets/css/app.css">
</head>
<body>

<div class="page">
    <header class="topbar">
        <div class="shell topbar-inner">
            <a class="brand" href="/">
                <span class="mark" aria-hidden="true"></span>
                snap<em>connect</em>
            </a>
            <nav class="nav-side" id="nav-side"></nav>
        </div>
    </header>

    <main class="page-body shell">
        <div class="settings-head rise">
            <a class="back" href="/profile.php" id="back-link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                </svg>
                Back to your profile
            </a>
            <h1>Edit profile</h1>
            <p>This is how friends see you across SnapConnect.</p>
        </div>

        <div class="alert alert-ok" id="welcome" role="status"></div>

        <div class="settings-grid">

            <section class="card rise rise-1">
                <div class="card-title">Profile photo</div>

                <div class="uploader-preview">
                    <span class="avatar size-128" id="avatar-preview"></span>
                </div>

                <div class="alert alert-error" id="upload-error" role="alert"></div>
                <div class="alert alert-ok" id="upload-ok" role="status"></div>

                <div class="dropzone" id="dropzone" role="button" tabindex="0"
                     aria-label="Choose an image to upload">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="4"/>
                        <circle cx="8.8" cy="8.8" r="1.9"/>
                        <path d="m21 15.2-4.4-4.4-8 8"/>
                    </svg>
                    <b>Drag a photo here</b>
                    <small>or click to browse — PNG, JPG or GIF, up to 2 MB</small>
                </div>
                <input type="file" id="file-input" accept="image/png,image/jpeg,image/gif" hidden>

                <div class="file-meta" id="file-meta">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color: var(--lime); flex: none">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                        <polyline points="13 2 13 9 20 9"/>
                    </svg>
                    <span class="name" id="file-name"></span>
                    <span class="size" id="file-size"></span>
                    <button type="button" class="swap" id="file-swap">Change</button>
                </div>

                <div class="progress" id="progress"><i id="progress-bar"></i></div>

                <div class="uploader-actions">
                    <button class="btn btn-primary" id="upload-btn" type="button" disabled>Upload photo</button>
                </div>
            </section>

            <section class="card rise rise-2">
                <div class="card-title">Details</div>

                <div class="alert alert-error" id="details-error" role="alert"></div>

                <form id="details-form" novalidate>
                    <div class="field">
                        <label for="displayName">Display name</label>
                        <input class="input" id="displayName" type="text" maxlength="40"
                               placeholder="How friends see you" required>
                    </div>

                    <div class="field">
                        <label for="bio">Bio</label>
                        <textarea class="textarea" id="bio" maxlength="160"
                                  placeholder="A couple of lines about you"></textarea>
                        <div class="char-counter" id="bio-counter">0 / 160</div>
                    </div>

                    <div class="form-actions">
                        <button class="btn btn-primary" type="submit" id="save-btn">Save changes</button>
                        <span class="saved-flash" id="saved-flash">Saved</span>
                    </div>
                </form>
            </section>

        </div>
    </main>

    <footer class="site-foot">
        <div class="shell inner">
            <span>© 2026 SnapConnect · a demo social app</span>
            <span><a href="/docs">API docs</a></span>
        </div>
    </footer>
</div>

<script src="/assets/js/api.js"></script>
<script src="/assets/js/ui.js"></script>
<script>
(function () {
    'use strict';

    var el = SnapUI.el;

    var dropzone = document.getElementById('dropzone');
    var fileInput = document.getElementById('file-input');
    var fileMeta = document.getElementById('file-meta');
    var fileName = document.getElementById('file-name');
    var fileSize = document.getElementById('file-size');
    var uploadBtn = document.getElementById('upload-btn');
    var uploadError = document.getElementById('upload-error');
    var uploadOk = document.getElementById('upload-ok');
    var progress = document.getElementById('progress');
    var progressBar = document.getElementById('progress-bar');
    var preview = document.getElementById('avatar-preview');

    var chosenFile = null;
    var currentAvatarUrl = null;
    var objectUrl = null;

    function hide(box) { box.classList.remove('show'); }
    function show(box, message) {
        box.textContent = message;
        box.classList.add('show');
        box.style.animation = 'none';
        void box.offsetWidth;
        box.style.animation = '';
    }

    function renderPreview(url, user) {
        preview.textContent = '';
        if (url) {
            var img = el('img', '');
            img.alt = 'Avatar preview';
            img.src = url;
            preview.appendChild(img);
        } else {
            preview.textContent = user ? user.username.charAt(0).toUpperCase() : '?';
        }
    }

    function humanSize(bytes) {
        if (bytes > 1024 * 1024) {
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }
        return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    }

    function acceptFile(file) {
        if (!file) {
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            show(uploadError, 'That file is over the 2 MB limit. Pick something smaller.');
            return;
        }
        hide(uploadError);
        hide(uploadOk);

        chosenFile = file;
        fileName.textContent = file.name;
        fileSize.textContent = humanSize(file.size);
        fileMeta.classList.add('show');
        uploadBtn.disabled = false;

        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
        objectUrl = URL.createObjectURL(file);
        renderPreview(objectUrl);
    }

    dropzone.addEventListener('click', function () { fileInput.click(); });
    dropzone.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInput.click();
        }
    });
    document.getElementById('file-swap').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { acceptFile(fileInput.files[0]); });

    ['dragenter', 'dragover'].forEach(function (name) {
        dropzone.addEventListener(name, function (event) {
            event.preventDefault();
            dropzone.classList.add('dragover');
        });
    });
    ['dragleave', 'drop'].forEach(function (name) {
        dropzone.addEventListener(name, function (event) {
            event.preventDefault();
            dropzone.classList.remove('dragover');
        });
    });
    dropzone.addEventListener('drop', function (event) {
        acceptFile(event.dataTransfer.files[0]);
    });

    uploadBtn.addEventListener('click', function () {
        if (!chosenFile) {
            return;
        }
        hide(uploadError);
        hide(uploadOk);
        uploadBtn.classList.add('is-loading');
        uploadBtn.disabled = true;
        progress.classList.add('show');
        progressBar.style.width = '4%';

        Snap.uploadAvatar(chosenFile, function (percent) {
            progressBar.style.width = Math.max(4, percent) + '%';
        }).then(function (result) {
            progressBar.style.width = '100%';
            uploadBtn.classList.remove('is-loading');
            uploadBtn.disabled = false;
            show(uploadOk, result.message || 'Avatar updated.');

            currentAvatarUrl = result.url + '?v=' + Date.now();
            setTimeout(function () { progress.classList.remove('show'); }, 700);
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
                objectUrl = null;
            }
            renderPreview(currentAvatarUrl);
            Snap.me().then(function (me) { SnapUI.renderNav(me); }).catch(function () {});
        }).catch(function (error) {
            uploadBtn.classList.remove('is-loading');
            uploadBtn.disabled = false;
            progress.classList.remove('show');
            progressBar.style.width = '0%';
            show(uploadError, error.message);
        });
    });

    /* ----- details form ----- */

    var detailsForm = document.getElementById('details-form');
    var detailsError = document.getElementById('details-error');
    var saveBtn = document.getElementById('save-btn');
    var savedFlash = document.getElementById('saved-flash');
    var bio = document.getElementById('bio');
    var bioCounter = document.getElementById('bio-counter');

    function syncCounter() {
        bioCounter.textContent = bio.value.length + ' / 160';
        bioCounter.classList.toggle('over', bio.value.length > 160);
    }
    bio.addEventListener('input', syncCounter);

    detailsForm.addEventListener('submit', function (event) {
        event.preventDefault();
        hide(detailsError);

        var displayName = document.getElementById('displayName').value.trim();
        if (!displayName) {
            show(detailsError, 'Display name cannot be empty.');
            return;
        }

        saveBtn.classList.add('is-loading');
        saveBtn.disabled = true;

        Snap.gql(
            'mutation ($displayName: String!, $bio: String!) {' +
            '  updateProfile(displayName: $displayName, bio: $bio) { username displayName bio }' +
            '}',
            { displayName: displayName, bio: bio.value.trim() }
        ).then(function () {
            saveBtn.classList.remove('is-loading');
            saveBtn.disabled = false;
            savedFlash.classList.add('show');
            setTimeout(function () { savedFlash.classList.remove('show'); }, 2200);
        }).catch(function (error) {
            saveBtn.classList.remove('is-loading');
            saveBtn.disabled = false;
            show(detailsError, error.message);
        });
    });

    /* ----- boot ----- */

    if (new URLSearchParams(window.location.search).get('welcome')) {
        var box = document.getElementById('welcome');
        box.textContent = 'Profile created. Add a photo so friends recognize you.';
        box.classList.add('show');
        setTimeout(function () { hide(box); }, 6000);
    }

    SnapUI.requireAuth().then(function (me) {
        renderPreview(me.avatarUrl, me);
        currentAvatarUrl = me.avatarUrl;
        document.getElementById('displayName').value = me.displayName || me.username;
        bio.value = me.bio || '';
        syncCounter();
        document.getElementById('back-link').href = '/profile.php';
        document.title = 'Edit profile · @' + me.username + ' — SnapConnect';
    });
})();
</script>
</body>
</html>
