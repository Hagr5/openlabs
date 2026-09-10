<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');

$checks = [
    'database' => (int) db()->query('SELECT 1')->fetchColumn() === 1,
    'uploads_writable' => is_writable(UPLOAD_DIR),
    'graphql_library' => class_exists('GraphQL\GraphQL'),
    'flag_available' => is_readable(FLAG_PATH),
];

$healthy = !in_array(false, $checks, true);
http_response_code($healthy ? 200 : 503);

echo json_encode([
    'status' => $healthy ? 'ok' : 'degraded',
    'service' => 'snapconnect-api',
    'version' => '2.0.0',
    'checks' => $checks,
]);
