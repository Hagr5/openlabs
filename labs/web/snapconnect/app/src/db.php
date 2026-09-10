<?php

declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;

    if ($pdo === null) {
        $pdo = new PDO('sqlite:' . DB_PATH, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA foreign_keys = ON');
    }

    return $pdo;
}

function user_by_email(string $email): ?array
{
    $statement = db()->prepare('SELECT * FROM users WHERE email = ?');
    $statement->execute([$email]);
    $row = $statement->fetch();

    return $row === false ? null : $row;
}

function user_by_username(string $username): ?array
{
    $statement = db()->prepare('SELECT * FROM users WHERE username = ?');
    $statement->execute([$username]);
    $row = $statement->fetch();

    return $row === false ? null : $row;
}

function user_by_token(string $token): ?array
{
    $statement = db()->prepare(
        'SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?'
    );
    $statement->execute([$token]);
    $row = $statement->fetch();

    return $row === false ? null : $row;
}

function create_user(string $username, string $email, string $passwordHash, string $displayName): array
{
    $statement = db()->prepare(
        'INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)'
    );
    $statement->execute([$username, $email, $passwordHash, $displayName]);

    return user_by_username($username);
}

function issue_token(int $userId): string
{
    $token = bin2hex(random_bytes(32));
    $statement = db()->prepare('INSERT INTO tokens (token, user_id) VALUES (?, ?)');
    $statement->execute([$token, $userId]);

    return $token;
}

function set_avatar_path(int $userId, string $path): void
{
    $statement = db()->prepare('UPDATE users SET avatar_path = ? WHERE id = ?');
    $statement->execute([$path, $userId]);
}

function update_profile(int $userId, string $displayName, string $bio): array
{
    $statement = db()->prepare('UPDATE users SET display_name = ?, bio = ? WHERE id = ?');
    $statement->execute([$displayName, $bio, $userId]);

    return user_by_id($userId);
}

function user_by_id(int $userId): array
{
    $statement = db()->prepare('SELECT * FROM users WHERE id = ?');
    $statement->execute([$userId]);
    $row = $statement->fetch();

    if ($row === false) {
        throw new RuntimeException("user $userId disappeared mid-update");
    }

    return $row;
}
