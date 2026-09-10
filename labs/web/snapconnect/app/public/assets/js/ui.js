/* Shared UI helpers: nav rendering, auth guard, small DOM utilities. */

(function () {
    'use strict';

    const logoMark =
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none">' +
        '<circle cx="12" cy="12" r="8.5" stroke="#151a04" stroke-width="2.6"/>' +
        '<circle cx="17" cy="7" r="2.6" fill="#151a04"/>' +
        '</svg>';

    const gearIcon =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' +
        '</svg>';

    const logoutIcon =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>' +
        '</svg>';

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    }

    function avatarNode(user, size) {
        const node = el('span', 'avatar size-' + size);
        if (user && user.avatarUrl) {
            const img = el('img', '');
            img.alt = '';
            img.src = user.avatarUrl;
            node.appendChild(img);
        } else {
            node.textContent = user && user.username ? user.username.charAt(0).toUpperCase() : '?';
        }
        return node;
    }

    function joinedLabel(isoLike) {
        if (!isoLike) {
            return 'Recently joined';
        }
        const date = new Date(isoLike.trim().replace(' ', 'T') + 'Z');
        if (isNaN(date)) {
            return 'Recently joined';
        }
        return 'Joined ' + date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }

    function renderNav(me) {
        const mount = document.getElementById('nav-side');
        if (!mount) {
            return;
        }
        mount.textContent = '';

        if (!me) {
            const login = el('a', 'btn btn-ghost btn-sm', 'Log in');
            login.href = '/login.php';
            const join = el('a', 'btn btn-primary btn-sm', 'Join SnapConnect');
            join.href = '/register.php';
            mount.appendChild(login);
            mount.appendChild(join);
            return;
        }

        const profileLink = el('a', 'nav-user');
        profileLink.href = '/profile.php';
        profileLink.title = 'Your profile';
        const at = el('span', 'at', '@' + me.username);
        profileLink.appendChild(avatarNode(me, 36));
        profileLink.appendChild(at);
        profileLink.addEventListener('click', function (event) {
            event.preventDefault();
            window.location.href = '/profile.php';
        });

        const settings = el('a', 'icon-btn');
        settings.href = '/settings.php';
        settings.title = 'Edit profile';
        settings.innerHTML = gearIcon;

        const logout = el('button', 'icon-btn');
        logout.type = 'button';
        logout.title = 'Log out';
        logout.innerHTML = logoutIcon;
        logout.addEventListener('click', function () {
            window.Snap.logout();
        });

        mount.appendChild(profileLink);
        mount.appendChild(settings);
        mount.appendChild(logout);
    }

    function bootNav() {
        const brandMark = document.querySelector('.brand .mark');
        if (brandMark) {
            brandMark.innerHTML = logoMark;
        }

        if (!window.Snap.token) {
            renderNav(null);
            return;
        }
        window.Snap.me()
            .then(renderNav)
            .catch(function () {
                window.Snap.clearToken();
                renderNav(null);
            });
    }

    /* Page guard: redirect to login when there is no valid session. */
    function requireAuth() {
        return new Promise(function (resolve) {
            if (!window.Snap.token) {
                window.location.href = '/login.php?next=' + encodeURIComponent(window.location.pathname);
                return;
            }
            window.Snap.me()
                .then(resolve)
                .catch(function () {
                    window.Snap.clearToken();
                    window.location.href = '/login.php?expired=1';
                });
        });
    }

    document.addEventListener('DOMContentLoaded', bootNav);

    window.SnapUI = {
        el: el,
        avatarNode: avatarNode,
        joinedLabel: joinedLabel,
        renderNav: renderNav,
        requireAuth: requireAuth,
    };
})();
