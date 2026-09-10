# SnapConnect remediation

Author document. This is the fix that `SECURITY-REPORT.md` points to.

## Root cause

The filter denies known-bad extensions instead of allowing known-good ones, and it validates the start of the file instead of the whole file. Storage compounds both: uploads keep their original name inside an executable web directory.

## Changes required

1. Allow-list extensions instead of blacklisting.
2. Decode and re-encode the image server-side so stored bytes come from GD, not the client.
3. Store under random names outside the document root and serve through a controller with fixed headers.
4. Stop executing anything in uploads and remove the `.php8` handler mapping.

## Patched upload handler

Replace `store_avatar()` in `app/src/uploads.php`:

```php
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif'];
const AVATAR_MAX_BYTES = 2097152;

function store_avatar_secure(array $file, array $user): array
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new UserError('Upload failed in transit.');
    }
    if (($file['size'] ?? 0) > AVATAR_MAX_BYTES) {
        throw new UserError('File exceeds the 2 MiB avatar limit.');
    }

    $extension = strtolower(pathinfo(basename((string) $file['name']), PATHINFO_EXTENSION));
    if (!in_array($extension, ALLOWED_EXTENSIONS, true)) {
        throw new UserError('File type not allowed.');
    }

    // Full decode and re-encode: stored bytes are produced by GD, so any
    // trailing payload is discarded, not trusted.
    $source = @imagecreatefromstring((string) file_get_contents($file['tmp_name']));
    if ($source === false) {
        throw new UserError('File does not decode as an image.');
    }

    // Random name outside the document root. The extension comes from the
    // allowlist, never from the user.
    $storedName = bin2hex(random_bytes(16)) . '.' . $extension;
    $destination = DATA_DIR . '/avatars/' . $storedName;
    if (!is_dir(dirname($destination))) {
        mkdir(dirname($destination), 0770, true);
    }

    $saved = match ($extension) {
        'gif' => imagegif($source, $destination),
        'png' => imagepng($source, $destination),
        default => imagejpeg($source, $destination, 90),
    };
    imagedestroy($source);
    if (!$saved) {
        throw new UserError('Could not store the upload.');
    }

    $url = '/avatar/' . $storedName;
    set_avatar_path((int) $user['id'], $url);

    return ['success' => true, 'url' => $url, 'message' => 'Avatar updated.'];
}
```

## Serving controller

Map `/avatar/<name>` to `app/public/avatar.php`:

```php
$name = basename($_GET['name'] ?? '');
$path = DATA_DIR . '/avatars/' . $name;

$types = ['gif' => 'image/gif', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png'];
$extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));

if (!preg_match('/^[a-f0-9]{32}\.(gif|jpe?g|png)$/', $name) || !is_file($path)) {
    http_response_code(404);
    exit;
}

header('Content-Type: ' . $types[$extension]);
header('X-Content-Type-Options: nosniff');
header('Content-Disposition: inline');
readfile($path);
```

## Apache changes

Delete `app/apache/php8-handler.conf` and its `a2enconf` line from the `Dockerfile`. Add to the vhost as defense in depth:

```apache
<Directory /var/www/public/uploads>
    Options -Indexes -MultiViews
    AllowOverride None
    Require all granted
    <FilesMatch "\.(ph|phar|php[0-9]?|phtml|pht|cgi|pl)$">
        Require all denied
    </FilesMatch>
</Directory>
```

## What each change removes

- The extension allowlist removes the `.php8` gap and every future extension that gains a handler.
- Decode and re-encode removes polyglots. GD writes the stored file, nothing else.
- Random names outside the document root remove known-URL execution and original-filename attacks.
- The controller's fixed `Content-Type` and `nosniff` remove content sniffing.
- Deleting the `.php8` mapping removes execution of unmapped PHP extensions from user storage.
- The deny rule in uploads removes residual risk if storage becomes web facing again.

## Retest

1. Apply the patch and run `./reset.sh`.
2. Run `python3 ops/validate.py`.
3. The secure build passes phases 0 to 4 and fails phases 5 and 6: the polyglot is rejected or stored inert, and nothing executes.
4. The vulnerable build must keep passing all 37 checks. That difference is the regression signal.
