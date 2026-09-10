<?php

declare(strict_types=1);

use GraphQL\Error\UserError;
use GraphQL\GraphQL;
use GraphQL\Type\Definition\CustomScalarType;
use GraphQL\Type\Definition\ObjectType;
use GraphQL\Type\Definition\Type;
use GraphQL\Type\Schema;

function build_schema(): Schema
{
    $userType = new ObjectType([
        'name' => 'User',
        'description' => 'A SnapConnect member.',
        'fields' => [
            'id' => ['type' => Type::id(), 'resolve' => fn (array $user) => $user['id'] ?? null],
            'username' => ['type' => Type::string(), 'resolve' => fn (array $user) => $user['username'] ?? null],
            'email' => [
                'type' => Type::string(),
                'description' => 'Visible only when the profile belongs to the caller.',
                'resolve' => fn (array $user, array $args, array $context) =>
                    isset($context['user']) && (string) $context['user']['id'] === (string) $user['id']
                        ? ($user['email'] ?? null)
                        : null,
            ],
            'displayName' => ['type' => Type::string(), 'resolve' => fn (array $user) => $user['displayName'] ?? null],
            'bio' => ['type' => Type::string(), 'resolve' => fn (array $user) => $user['bio'] ?? null],
            'avatarUrl' => ['type' => Type::string(), 'resolve' => fn (array $user) => $user['avatarUrl'] ?? null],
            'createdAt' => ['type' => Type::string(), 'resolve' => fn (array $user) => $user['createdAt'] ?? null],
        ],
    ]);

    $authPayloadType = new ObjectType([
        'name' => 'AuthPayload',
        'description' => 'Session token for the SnapConnect API.',
        'fields' => [
            'token' => ['type' => Type::nonNull(Type::string()), 'resolve' => fn (array $payload) => $payload['token']],
            'user' => ['type' => Type::nonNull($userType), 'resolve' => fn (array $payload) => $payload['user']],
        ],
    ]);

    $uploadResultType = new ObjectType([
        'name' => 'UploadResult',
        'description' => 'Outcome of an avatar upload.',
        'fields' => [
            'success' => ['type' => Type::nonNull(Type::boolean()), 'resolve' => fn (array $result) => $result['success']],
            'url' => ['type' => Type::string(), 'resolve' => fn (array $result) => $result['url'] ?? null],
            'message' => ['type' => Type::string(), 'resolve' => fn (array $result) => $result['message'] ?? null],
        ],
    ]);

    // Upload follows the graphql-multipart-request-spec: the variable travels
    // as null inside the operations JSON and a file part is mapped onto it.
    $uploadScalar = new CustomScalarType([
        'name' => 'Upload',
        'description' => 'A file part mapped in from a multipart request.',
        'serialize' => fn () => null,
        'parseValue' => fn ($value) => $value,
        'parseLiteral' => fn () => throw new UserError('Upload variables must be mapped from a multipart file part.'),
    ]);

    $queryType = new ObjectType([
        'name' => 'Query',
        'fields' => [
            'serverVersion' => [
                'type' => Type::string(),
                'description' => 'API build identifier.',
                'resolve' => fn () => '2.0.0',
            ],
            'me' => [
                'type' => $userType,
                'description' => 'The member identified by the bearer token.',
                'resolve' => fn (?array $root, array $args, array $context) => isset($context['user'])
                    ? public_user($context['user'])
                    : throw new UserError('Authentication required.'),
            ],
            'user' => [
                'type' => $userType,
                'description' => 'Look up a public profile by username.',
                'args' => [
                    'username' => ['type' => Type::nonNull(Type::string())],
                ],
                'resolve' => fn (?array $root, array $args) => self_or_public_profile(strtolower(trim($args['username']))),
            ],
        ],
    ]);

    $mutationType = new ObjectType([
        'name' => 'Mutation',
        'fields' => [
            'login' => [
                'type' => Type::nonNull($authPayloadType),
                'description' => 'Exchange email and password for a session token.',
                'args' => [
                    'email' => ['type' => Type::nonNull(Type::string())],
                    'password' => ['type' => Type::nonNull(Type::string())],
                ],
                'resolve' => fn (?array $root, array $args) => login($args['email'], $args['password']),
            ],
            'register' => [
                'type' => Type::nonNull($authPayloadType),
                'description' => 'Create an account and receive a session token.',
                'args' => [
                    'username' => ['type' => Type::nonNull(Type::string())],
                    'email' => ['type' => Type::nonNull(Type::string())],
                    'password' => ['type' => Type::nonNull(Type::string())],
                    'displayName' => ['type' => Type::string()],
                ],
                'resolve' => fn (?array $root, array $args) => register(
                    $args['username'],
                    $args['email'],
                    $args['password'],
                    $args['displayName'] ?? null
                ),
            ],
            'updateProfile' => [
                'type' => Type::nonNull($userType),
                'description' => 'Update the profile of the current member.',
                'args' => [
                    'displayName' => ['type' => Type::nonNull(Type::string())],
                    'bio' => ['type' => Type::nonNull(Type::string())],
                ],
                'resolve' => fn (?array $root, array $args, array $context) => update_profile_for(
                    $context['user'] ?? throw new UserError('Authentication required.'),
                    $args['displayName'],
                    $args['bio']
                ),
            ],
            'uploadAvatar' => [
                'type' => Type::nonNull($uploadResultType),
                'description' => 'Attach a profile picture to the current member. Send the file as a multipart part mapped onto $file.',
                'args' => [
                    'file' => ['type' => Type::nonNull($uploadScalar)],
                ],
                'resolve' => fn (?array $root, array $args, array $context) => store_avatar(
                    $args['file'],
                    $context['user'] ?? throw new UserError('Authentication required.')
                ),
            ],
        ],
    ]);

    return new Schema([
        'query' => $queryType,
        'mutation' => $mutationType,
        'types' => [$uploadScalar],
    ]);
}

function self_or_public_profile(string $username): ?array
{
    $user = user_by_username($username);
    if ($user === null) {
        return null;
    }

    return public_user($user);
}

function execute_graphql(array $data, array $context): array
{
    $result = GraphQL::executeQuery(
        build_schema(),
        (string) ($data['query'] ?? ''),
        null,
        $context,
        is_array($data['variables'] ?? null) ? $data['variables'] : null,
        isset($data['operationName']) ? (string) $data['operationName'] : null
    );

    foreach ($result->errors as $error) {
        $cause = $error->getPrevious();
        if ($cause !== null) {
            error_log('graphql error: ' . $cause->getMessage());
        }
    }

    return $result->toArray();
}
