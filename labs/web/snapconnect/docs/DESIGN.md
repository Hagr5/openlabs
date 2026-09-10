# SnapConnect design document

Author document. Full spoilers.

Name: SnapConnect
Track: web
Difficulty: easy
Estimated solve time: 10 to 30 minutes
Primary vulnerability: Unrestricted file upload leading to remote code execution (CWE-434)
Secondary vulnerability: GraphQL introspection as the recon enabler
Flag format: `duck{...}`, lowercase letters, digits, underscores, 16 to 40 characters

Learning objective: understand why layered upload validation fails when both layers are shallow. An incomplete extension blacklist and a magic-byte-only content check both miss the same payload, and the server executes the extension the blacklist forgot.

## Scenario

SnapConnect is a fictional social app with profiles, bios, and avatars. The frontend is a real product surface so the upload feature looks shipped, not staged.

The failure mirrors real deployments. The upload filter was written from a list of extensions the team knew. Later, an engine drill mapped `.php8` onto the PHP handler and nobody revisited the filter. The content check grew the same way: read the first bytes, then trust the rest.

## Attacker starting point

- The app at `http://localhost:8081` with open registration and no handed-out credentials
- The GraphQL endpoint at `POST /graphql`
- A neutral API reference at `/docs`
- Knowledge that the flag sits at `/var/www/flag.txt`, outside the web root

Members can call `login`, `register`, `me`, `user`, `updateProfile`, and `uploadAvatar`. Nothing else.

## Intended attack path

1. Enumerate the schema through introspection and find `uploadAvatar(file: Upload!)`. The multipart format comes from watching the profile editor upload an avatar.
2. Register an account for a bearer token.
3. Probe the controls. `.php` returns `File type not allowed.` A raw `.php8` returns `File does not look like an image.` A valid image passes. The two messages show that two separate checks exist.
4. Infer the gap. The extension check is a list and `.php8` is not on it. The content check reads only the first bytes.
5. Build a polyglot: `GIF89a` followed by `<?php system($_GET["cmd"]); ?>`, named `shell.jpg.php8`. It clears both checks.
6. Upload it. The file is stored under the web root with its original name.
7. Request `/uploads/shell.jpg.php8?cmd=cat /var/www/flag.txt`. The server runs the file as PHP and returns the flag.

Steps 4 and 5 carry the reasoning. The rest is observation.

## Flag condition

GET on the uploaded polyglot with `cmd=cat /var/www/flag.txt` returns the flag as `www-data`, which can read the group-readable file at `/var/www/flag.txt`. No other HTTP path reaches it.

## Architecture

One container runs PHP 8.3 with Apache and mod_php.

Inside the container:

- `/var/www/public` is the document root. It holds `index.php`, `login.php`, `register.php`, `profile.php`, `settings.php`, `docs.php` served at `/docs`, `graphql.php` served at `/graphql`, `health.php`, `assets/`, and `uploads/`.
- `uploads/` is web writable. Apache executes `.php8` anywhere under the document root, including `uploads/`.
- `/var/www/src`, `/var/www/vendor`, `/var/www/seeds`, and `/var/www/data/app.db` sit outside the document root.
- `/var/www/flag.txt` sits outside the document root, owned by `root:www-data`, mode `440`.

Trust boundaries:

- The browser is untrusted. The frontend keeps a bearer token in `localStorage` and calls the API like any client.
- The token gates `me`, `updateProfile`, and `uploadAvatar`. `register` and public `user` lookups are open.
- The validation in `app/src/uploads.php` is the only control between client input and the writable web directory.
- Member emails are private. The `User.email` field resolves only for the token owner.

## Frontend surface

- Landing: short hero, plain accent label, floating profile-card mockups built from real seeded avatars, login and register links.
- Auth: centered cards, password visibility toggle, inline errors, loading state on submit.
- Profile: gradient band, overlapping avatar, left rail with identity and bio, honest empty state for snaps. Public view at `/profile.php?u=<handle>`.
- Profile editor: drag-and-drop uploader with preview, progress bar, and server messages surfaced as errors. This is the attack surface dressed as a product feature.
- API reference: stock Swagger UI at `/docs` backed by `/openapi.json`. It documents the GraphQL endpoint, uploads, and health in neutral terms. It does not enumerate operations or the multipart format.

The frontend makes no security decisions. The file input's `accept` list is cosmetic, as in real applications. All enforcement is server-side.

## Integrity

- Path traversal in filenames — blocked by `basename()` plus a character allowlist. solve.py asserts containment.
- `.htaccess` or `.user.ini` upload — rejected by the filename policy (leading dot) and the content check. `AllowOverride None` is set and mod_php ignores `.user.ini`.
- Overwriting app pages — blocked. `index.php` and friends end in `.php`, which the blacklist rejects.
- SVG or HTML upload for stored XSS — blocked. No image signature matches. Profile text renders through `textContent` only.
- SQL injection — none. Every query is a prepared statement.
- Auth bypass or token guessing — none. Tokens are 256-bit random hex from `random_bytes()`. Passwords use `password_hash()`. Login errors are generic.
- Mass assignment — none. `register` and `updateProfile` take explicit arguments with length checks.
- Email enumeration — none. Public profiles expose username, display name, bio, avatar, and join date. Email resolves only for the token owner.
- Directory listing — disabled with `Options -Indexes`.
- Static flag or source disclosure — impossible. Flag, source, vendor, seeds, and data live outside the document root.
- Brute force — no target. Passwords have a length minimum and the flag is not behind a guessable value.

Introspection stays enabled on purpose. Schema discovery is part of the recon objective, not a shortcut.

## Determinism and reset

The entrypoint wipes `data/` and `public/uploads/`, reseeds the database, and copies the seeded avatars on every start. `./reset.sh` or `docker compose down -v && docker compose up -d --build` returns the lab to its initial state without touching source. `ops/health_check.sh` and `ops/validate.py` pass from a clean state after every reset.

## Deployment assumptions

- Base image `php:8.3-apache` with mod_php and mpm_prefork.
- `webonyx/graphql-php` v15.37.2, locked in `app/composer.lock`, installed at build time. No runtime internet access.
- The frontend ships no third-party assets at runtime. The typeface (Plus Jakarta Sans, OFL) and Swagger UI are self-hosted.
- The documented host port is `8081`.
- The `.php8` handler mapping in `app/apache/php8-handler.conf` is the deliberate misconfiguration under test. Real cases of this bug often hinge on exactly such a mapping.
