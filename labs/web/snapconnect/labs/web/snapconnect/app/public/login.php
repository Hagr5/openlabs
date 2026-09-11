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
<title>Log in — SnapConnect</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%23c8f830'/%3E%3Ccircle cx='16' cy='16' r='7' fill='none' stroke='%23151a04' stroke-width='3'/%3E%3Ccircle cx='22' cy='10' r='3' fill='%23151a04'/%3E%3C/svg%3E">
<link rel="stylesheet" href="/assets/css/app.css">
</head>
<body>

<div class="page">
    <div class="auth-wrap">
        <main class="auth-card rise">
            <div class="auth-head">
                <a class="brand" href="/">
                    <span class="mark" aria-hidden="true"></span>
                    snap<em>connect</em>
                </a>
                <h1>Welcome back</h1>
                <p>Log in to see what your friends are up to.</p>
            </div>

            <div class="alert alert-error" id="error" role="alert"></div>

            <form id="login-form" novalidate>
                <div class="field">
                    <label for="email">Email</label>
                    <input class="input" id="email" name="email" type="email" autocomplete="email"
                           placeholder="you@example.com" required autofocus>
                </div>

                <div class="field">
                    <label for="password">Password</label>
                    <div class="input-wrap">
                        <input class="input" id="password" name="password" type="password"
                               autocomplete="current-password" placeholder="Your password" required>
                        <button class="peek-btn" type="button" id="peek" aria-label="Show password">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <button class="btn btn-primary btn-lg" type="submit" id="submit"
                        style="width: 100%">Log in</button>
            </form>

            <p class="auth-alt">New here? <a href="/register.php">Create an account</a></p>
        </main>
    </div>
</div>

<script src="/assets/js/api.js"></script>
<script src="/assets/js/ui.js"></script>
<script>
(function () {
    'use strict';

    var form = document.getElementById('login-form');
    var errorBox = document.getElementById('error');
    var submit = document.getElementById('submit');
    var peek = document.getElementById('peek');
    var password = document.getElementById('password');

    peek.addEventListener('click', function () {
        var hidden = password.type === 'password';
        password.type = hidden ? 'text' : 'password';
        peek.style.color = hidden ? '#c8f830' : '';
    });

    function showError(message) {
        errorBox.textContent = message;
        errorBox.classList.add('show');
        /* retrigger the entrance animation so repeat errors still feel alive */
        errorBox.style.animation = 'none';
        void errorBox.offsetWidth;
        errorBox.style.animation = '';
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        errorBox.classList.remove('show');

        var email = document.getElementById('email').value.trim();
        var pass = password.value;
        if (!email || !pass) {
            showError('Enter your email and password.');
            return;
        }

        submit.classList.add('is-loading');
        submit.disabled = true;

        Snap.gql(
            'mutation ($email: String!, $password: String!) {' +
            '  login(email: $email, password: $password) { token user { username } }' +
            '}',
            { email: email, password: pass }
        ).then(function (data) {
            Snap.saveToken(data.login.token);
            var next = new URLSearchParams(window.location.search).get('next');
            window.location.href = next && next.startsWith('/') ? next : '/profile.php';
        }).catch(function (error) {
            submit.classList.remove('is-loading');
            submit.disabled = false;
            showError(error.message);
        });
    });
})();
</script>
</body>
</html>
