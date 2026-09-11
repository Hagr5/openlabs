<?php

declare(strict_types=1);

use GraphQL\Error\UserError;

function bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($header === '' && function_exists('getallheaders')) {
        $headers = array_change_key_case(getallheaders(), CASE_LOWER);
        $header = $headers['authorization'] ?? '';
    }

    if (preg_match('/^Bearer\s+(\S+)$/i', trim($header), $matches) !== 1) {
        return null;
    }

    return $matches[1];
}

function current_user(): ?array
{
    $token = bearer_token();
    if ($token === null) {
        return null;
    }

    return user_by_token($token);
}

function public_user(array $row): array
{
    return [
        'id' => (string) $row['id'],
        'username' => $row['username'],
        'email' => $row['email'],
        'displayName' => $row['display_name'],
        'bio' => $row['bio'] ?? null,
        'avatarUrl' => $row['avatar_path'] ?? null,
        'createdAt' => $row['created_at'],
    ];
}

function login(string $email, string $password): array
{
    $user = user_by_email(trim(strtolower($email)));
    if ($user === null || !password_verify($password, $user['password_hash'])) {
        throw new UserError('Invalid email or password.');
    }

    $token = issue_token((int) $user['id']);

    return ['token' => $token, 'user' => public_user($user)];
}

function register(string $username, string $email, string $password, ?string $displayName): array
{
    $username = strtolower(trim($username));
    if (preg_match('/^[a-z0-9_]{3,20}$/', $username) !== 1) {
        throw new UserError('Usernames are 3 to 20 characters: lowercase letters, digits, or underscores.');
    }

    $email = trim(strtolower($email));
    if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        throw new UserError('Enter a valid email address.');
    }

    if (strlen($password) < 8) {
        throw new UserError('Passwords need at least 8 characters.');
    }

    $displayName = trim($displayName ?? '');
    if ($displayName === '') {
        $displayName = $username;
    }
    if (mb_strlen($displayName) > 40) {
        throw new UserError('Display names are limited to 40 characters.');
    }

    if (user_by_email($email) !== null) {
        throw new UserError('Email is already registered.');
    }
    if (user_by_username($username) !== null) {
        throw new UserError('Username is taken.');
    }

    $user = create_user($username, $email, password_hash($password, PASSWORD_DEFAULT), $displayName);
    $token = issue_token((int) $user['id']);

    return ['token' => $token, 'user' => public_user($user)];
}

function update_profile_for(array $user, ?string $displayName, ?string $bio): array
{
    $displayName = trim($displayName ?? '');
    if ($displayName === '') {
        throw new UserError('Display name cannot be empty.');
    }
    if (mb_strlen($displayName) > 40) {
        throw new UserError('Display names are limited to 40 characters.');
    }

    $bio = trim($bio ?? '');
    if (mb_strlen($bio) > 160) {
        throw new UserError('Bios are limited to 160 characters.');
    }

    $row = update_profile((int) $user['id'], $displayName, $bio);

    return public_user($row);
}
