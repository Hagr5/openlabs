<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function seed_members(): array
{
    return [
        [
            'username' => 'casey',
            'email' => 'casey@snapconnect.dev',
            'password' => bin2hex(random_bytes(16)),
            'display_name' => 'Casey Marsh',
            'bio' => 'Product engineer. Coffee, film cameras, and long bike rides.',
            'avatar' => 'casey.png',
        ],
        [
            'username' => 'rowan',
            'email' => 'rowan@snapconnect.dev',
            'password' => bin2hex(random_bytes(16)),
            'display_name' => 'Rowan Reyes',
            'bio' => 'Illustrator. Drawing tiny worlds, one pixel at a time.',
            'avatar' => 'rowan.png',
        ],
        [
            'username' => 'mira',
            'email' => 'mira@snapconnect.dev',
            'password' => bin2hex(random_bytes(16)),
            'display_name' => 'Mira Chen',
            'bio' => 'Trail runner and plant collector. Ask me about ferns.',
            'avatar' => 'mira.png',
        ],
    ];
}

if (!is_dir(DATA_DIR)) {
    mkdir(DATA_DIR, 0770, true);
}

foreach (glob(DB_PATH . '*') ?: [] as $stale) {
    unlink($stale);
}

db()->exec('
    CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        bio TEXT,
        avatar_path TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
');

db()->exec('
    CREATE TABLE tokens (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
');

$seed = db()->prepare(
    'INSERT INTO users (username, email, password_hash, display_name, bio, avatar_path) VALUES (?, ?, ?, ?, ?, ?)'
);

foreach (seed_members() as $member) {
    $seed->execute([
        $member['username'],
        $member['email'],
        password_hash($member['password'], PASSWORD_DEFAULT),
        $member['display_name'],
        $member['bio'],
        '/uploads/' . $member['avatar'],
    ]);

    $avatarSource = APP_ROOT . '/seeds/' . $member['avatar'];
    if (is_file($avatarSource) && !is_file(UPLOAD_DIR . '/' . $member['avatar'])) {
        copy($avatarSource, UPLOAD_DIR . '/' . $member['avatar']);
    }
}

echo 'seeded ' . count(seed_members()) . ' members' . PHP_EOL;
