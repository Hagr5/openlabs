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
<title>SnapConnect — share the moment, skip the noise</title>
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
        <section class="hero">
            <div class="shell hero-grid">
                <div>
                    <span class="eyebrow rise">Now in open beta</span>
                    <h1 class="rise rise-1">Share the moment,<br><em>skip the noise</em>.</h1>
                    <p class="sub rise rise-2">
                        SnapConnect is a small, calm social space for the people you actually know.
                        Set up a profile, pick an avatar, and post your first snap.
                    </p>
                    <div class="hero-ctas rise rise-3">
                        <a class="btn btn-primary btn-lg" href="/register.php">Create your account</a>
                        <a class="btn btn-ghost btn-lg" href="/login.php">Log in</a>
                    </div>
                    <p class="hero-meta rise rise-3">Free while in beta.</p>
                </div>

                <div class="mock-stage" aria-hidden="true">
                    <div class="mock-card mock-back">
                        <div class="who">
                            <img class="avatar size-36" src="/uploads/mira.png" alt="">
                            <span>
                                <b>Mira Chen</b>
                                <small>@mira · just now</small>
                            </span>
                        </div>
                        <div class="mock-skeleton"><i style="width: 88%"></i><i style="width: 64%"></i></div>
                        <div class="mock-photo"></div>
                    </div>
                    <div class="mock-card mock-main">
                        <div class="who">
                            <img class="avatar size-36" src="/uploads/casey.png" alt="">
                            <span>
                                <b>Casey Marsh</b>
                                <small>@casey · 2m ago</small>
                            </span>
                        </div>
                        <div class="mock-skeleton"><i style="width: 92%"></i><i style="width: 71%"></i></div>
                        <div class="mock-photo"></div>
                    </div>
                </div>
            </div>
        </section>
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
</body>
</html>
