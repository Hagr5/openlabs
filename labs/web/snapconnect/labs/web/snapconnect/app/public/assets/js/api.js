/* SnapConnect shared API client. Vanilla JS, no dependencies. */

(function () {
    'use strict';

    const TOKEN_KEY = 'snapconnect_token';

    const api = {
        get token() {
            try {
                return localStorage.getItem(TOKEN_KEY);
            } catch (_) {
                return null;
            }
        },

        saveToken(token) {
            try {
                localStorage.setItem(TOKEN_KEY, token);
            } catch (_) { /* private mode: session simply won't persist */ }
        },

        clearToken() {
            try {
                localStorage.removeItem(TOKEN_KEY);
            } catch (_) { /* nothing to clear */ }
        },

        async gql(query, variables) {
            const headers = { 'Content-Type': 'application/json' };
            if (this.token) {
                headers['Authorization'] = 'Bearer ' + this.token;
            }

            const response = await fetch('/graphql', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ query: query, variables: variables || {} }),
            });

            if (!response.ok) {
                throw new Error('The service is unreachable. Try again.');
            }

            const body = await response.json();
            if (body.errors && body.errors.length > 0) {
                throw new Error(body.errors[0].message);
            }
            return body.data;
        },

        /* Avatar upload per the graphql-multipart-request spec, with progress. */
        uploadAvatar(file, onProgress) {
            return new Promise((resolve, reject) => {
                if (!this.token) {
                    reject(new Error('Please log in first.'));
                    return;
                }

                const form = new FormData();
                form.append('operations', JSON.stringify({
                    query: 'mutation ($file: Upload!) { uploadAvatar(file: $file) { success url message } }',
                    variables: { file: null },
                }));
                form.append('map', JSON.stringify({ 0: ['variables.file'] }));
                form.append('0', file, file.name);

                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/graphql');
                xhr.setRequestHeader('Authorization', 'Bearer ' + this.token);

                xhr.upload.addEventListener('progress', function (event) {
                    if (event.lengthComputable && typeof onProgress === 'function') {
                        onProgress(Math.round((event.loaded / event.total) * 100));
                    }
                });

                xhr.addEventListener('load', function () {
                    let body;
                    try {
                        body = JSON.parse(xhr.responseText);
                    } catch (_) {
                        reject(new Error('Unexpected response from the server.'));
                        return;
                    }
                    if (xhr.status !== 200) {
                        reject(new Error((body.errors && body.errors[0] && body.errors[0].message) || 'Upload failed.'));
                        return;
                    }
                    if (body.errors && body.errors.length > 0) {
                        reject(new Error(body.errors[0].message));
                        return;
                    }
                    resolve(body.data.uploadAvatar);
                });

                xhr.addEventListener('error', function () {
                    reject(new Error('Network error during upload.'));
                });

                xhr.send(form);
            });
        },

        me() {
            return this.gql('{ me { id username email displayName bio avatarUrl createdAt } }').then(function (data) {
                return data.me;
            });
        },

        user(username) {
            return this.gql('query ($u: String!) { user(username: $u) { id username displayName bio avatarUrl createdAt } }', { u: username })
                .then(function (data) {
                    return data.user;
                });
        },

        logout() {
            this.clearToken();
            window.location.href = '/';
        },
    };

    window.Snap = api;
})();
