<?php

declare(strict_types=1);

use GraphQL\Error\UserError;

const AVATAR_MAX_BYTES = 2097152;

// VULN (author note, spoiler): a blacklist of extensions the ops team knew
// about when the control was written. It is incomplete: ".php8" is missing
// because an engine upgrade drill mapped .php8 onto the PHP handler and this
// list was never revisited. The check itself is also deny-by-list: it inspects
// only the final suffix of the stored filename, so anything not on the list
// passes regardless of what the rest of the name looks like.
const BLOCKED_EXTENSIONS = [
    'php',
    'php3',
    'php4',
    'php5',
    'php7',
    'phtml',
    'phar',
    'pht',
];

function image_signature_matches(string $head): bool
{
    // VULN (author note, spoiler): this control reads exactly the first bytes
    // of the file and nothing else. Content after a valid image signature is
    // fully trusted. There is no re-sniffing, no decode, no sanitizing pass,
    // so executable code appended after GIF89a/JPEG/PNG magic passes here.
    return str_starts_with($head, "\xFF\xD8\xFF")
        || str_starts_with($head, "\x89PNG\r\n\x1a\n")
        || str_starts_with($head, 'GIF87a')
        || str_starts_with($head, 'GIF89a');
}

function store_avatar(array $file, array $user): array
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new UserError('Upload failed in transit.');
    }
    if (($file['size'] ?? 0) > AVATAR_MAX_BYTES) {
        throw new UserError('File exceeds the 2 MiB avatar limit.');
    }

    // basename plus the character allowlist below keep path traversal out of
    // scope. The challenge is the upload validation itself, not the storage
    // path, so this part is intentionally solid.
    $filename = basename((string) $file['name']);
    if (preg_match('/^[A-Za-z0-9._-]{1,128}$/', $filename) !== 1 || $filename[0] === '.') {
        throw new UserError('Filename contains unsupported characters.');
    }

    $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

    // VULN (author note, spoiler): layer 1. Deny-by-list on the final suffix,
    // and ".php8" is not on the list. "shell.jpg.php8" ends in php8, so it is
    // not "literally .php" from the list's point of view and passes.
    if (in_array($extension, BLOCKED_EXTENSIONS, true)) {
        throw new UserError('File type not allowed.');
    }

    $head = (string) @file_get_contents($file['tmp_name'], false, null, 0, 8);

    // VULN (author note, spoiler): layer 2. Magic-byte-only validation of the
    // first 8 bytes. A polyglot that starts with a real image signature and
    // continues with PHP source satisfies both layers at once.
    if (!image_signature_matches($head)) {
        throw new UserError('File does not look like an image.');
    }

    // VULN (author note, spoiler): the original filename is preserved and the
    // file lands inside the web root, where the server is configured to
    // execute .php8 files. Requesting the stored file runs the payload.
    $destination = UPLOAD_DIR . '/' . $filename;
    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        throw new UserError('Could not store the upload.');
    }

    $url = '/uploads/' . rawurlencode($filename);
    set_avatar_path((int) $user['id'], $url);

    return [
        'success' => true,
        'url' => $url,
        'message' => 'Avatar updated.',
    ];
}
