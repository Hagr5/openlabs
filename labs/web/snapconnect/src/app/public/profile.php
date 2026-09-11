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
<title>Profile — SnapConnect</title>
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

    <main class="page-body">
        <div class="profile-band"></div>

        <div class="shell profile-grid" id="profile-grid">

            <!-- skeleton shown while the profile loads -->
            <section class="card profile-card rise" id="profile-card">
                <span class="avatar size-152" style="margin-bottom: 22px"></span>
                <div class="skelly" style="width: 62%; height: 24px; margin-bottom: 10px"></div>
                <div class="skelly" style="width: 38%; height: 13px; margin-bottom: 24px"></div>
                <div class="skelly" style="width: 100%; height: 13px; margin-bottom: 8px"></div>
                <div class="skelly" style="width: 78%; height: 13px"></div>
            </section>

            <section class="card feed-card rise rise-1" id="feed-card">
                <div class="card-title">Snaps</div>
                <div class="empty-state">
                    <div class="ring">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                            <circle cx="12" cy="13" r="4"/>
                        </svg>
                    </div>
                    <h3>No snaps yet</h3>
                    <p id="empty-copy">When a snap is shared, it shows up here.</p>
                </div>
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
    var target = new URLSearchParams(window.location.search).get('u');

    function fillCard(user, isSelf) {
        var card = document.getElementById('profile-card');
        card.textContent = '';

        card.appendChild(SnapUI.avatarNode(user, 152));

        var name = el('h1', '', user.displayName || user.username);
        var handle = el('p', 'handle mono', '@' + user.username);
        card.appendChild(name);
        card.appendChild(handle);

        if (user.bio) {
            var bio = el('p', 'bio', user.bio);
            card.appendChild(bio);
        }

        var facts = el('div', 'profile-facts');
        var joined = el('div', '', '');
        joined.innerHTML =
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>' +
            '<line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
        joined.appendChild(document.createTextNode(SnapUI.joinedLabel(user.createdAt)));
        facts.appendChild(joined);
        card.appendChild(facts);

        if (isSelf) {
            var actions = el('div', 'profile-actions');
            var edit = el('a', 'btn btn-primary', 'Edit profile');
            edit.href = '/settings.php';
            actions.appendChild(edit);
            card.appendChild(actions);
        }
    }

    function showMissing(username) {
        var card = document.getElementById('profile-card');
        card.textContent = '';
        card.style.textAlign = 'center';

        var art = el('div', 'empty-state');
        art.appendChild(el('div', 'ring', ''));
        art.querySelector('.ring').innerHTML =
            '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
            '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
        art.appendChild(el('h3', '', 'No such profile'));
        art.appendChild(el('p', '', username ? ('Nobody here goes by @' + username + '.') : 'This profile could not be loaded.'));

        var back = el('a', 'btn btn-ghost btn-sm', 'Back home');
        back.href = '/';
        var actions = el('div', 'profile-actions');
        actions.style.justifyContent = 'center';
        actions.appendChild(back);

        card.appendChild(art);
        card.appendChild(actions);
        document.getElementById('feed-card').style.display = 'none';
    }

    function emptyCopyFor(username) {
        document.getElementById('empty-copy').textContent =
            'When @' + username + ' shares a snap, it shows up here.';
    }

    if (target) {
        Snap.user(target).then(function (user) {
            if (!user) {
                showMissing(target);
                return;
            }
            var isSelf = Snap.token
                ? Snap.me().then(function (me) { return me.username === user.username; }).catch(function () { return false; })
                : Promise.resolve(false);
            isSelf.then(function (own) {
                fillCard(user, own);
                emptyCopyFor(user.username);
            });
        }).catch(function () {
            showMissing(target);
        });
    } else {
        SnapUI.requireAuth().then(function (me) {
            fillCard(me, true);
            emptyCopyFor(me.username);
        });
    }
})();
</script>
</body>
</html>
