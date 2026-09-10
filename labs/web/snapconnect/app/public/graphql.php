<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

use GraphQL\Error\UserError;

header('Content-Type: application/json; charset=utf-8');

function bad_request(string $message): never
{
    http_response_code(400);
    echo json_encode(['errors' => [['message' => $message]]]);
    exit;
}

function inject_mapped_file(array &$operations, array $path, array $file): void
{
    if (count($path) < 2) {
        bad_request('Map paths must look like "variables.file".');
    }

    $node = &$operations;
    foreach (array_slice($path, 0, -1) as $segment) {
        if (!is_array($node) || !array_key_exists($segment, $node)) {
            bad_request('Map path does not exist in the operations document.');
        }
        $node = &$node[$segment];
    }

    $leaf = $path[count($path) - 1];
    if (!is_array($node) || !array_key_exists($leaf, $node)) {
        bad_request('Map path does not exist in the operations document.');
    }

    $node[$leaf] = $file;
}

function read_multipart_operations(): array
{
    $operations = json_decode($_POST['operations'] ?? '', true);
    $map = json_decode($_POST['map'] ?? '', true);

    if (!is_array($operations) || !is_array($map)) {
        bad_request('Multipart requests need "operations" and "map" form fields.');
    }

    foreach ($map as $fileKey => $paths) {
        $file = $_FILES[(string) $fileKey] ?? null;
        if ($file === null || !is_array($paths) || $paths === []) {
            bad_request('Map key "' . (string) $fileKey . '" has no matching file part.');
        }
        foreach ($paths as $path) {
            if (!is_string($path)) {
                bad_request('Map paths must look like "variables.file".');
            }
            inject_mapped_file($operations, explode('.', $path), $file);
        }
    }

    return $operations;
}

function read_operations(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

    if (str_contains($contentType, 'multipart/form-data')) {
        return read_multipart_operations();
    }

    $body = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($body) || !isset($body['query'])) {
        bad_request('Send a JSON body with a "query" field, or a multipart request per the graphql-multipart-request spec.');
    }

    return $body;
}

try {
    $context = ['user' => current_user()];
    echo json_encode(execute_graphql(read_operations(), $context), JSON_UNESCAPED_SLASHES);
} catch (UserError $error) {
    http_response_code(400);
    echo json_encode(['errors' => [['message' => $error->getMessage()]]]);
}
