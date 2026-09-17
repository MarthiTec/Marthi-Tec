<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = rtrim($path, '/') ?: '/';

if ($path === '/' || $path === '/health') {
    respond(200, [
        'success' => true,
        'data' => [
            'service' => getenv('APP_NAME') ?: 'Marthi API',
            'status' => 'ok',
            'time' => gmdate('c'),
            'database' => databaseStatus(),
        ],
    ]);
}

respond(404, [
    'success' => false,
    'error' => [
        'code' => 'NOT_FOUND',
        'message' => 'Endpoint não encontrado.',
        'details' => ['path' => $path],
    ],
]);

/**
 * @return array{configured: bool, connected: bool, error: ?string}
 */
function databaseStatus(): array
{
    $dsn = buildDsn();

    if ($dsn === null) {
        return [
            'configured' => false,
            'connected' => false,
            'error' => 'Variáveis de banco não configuradas.',
        ];
    }

    try {
        $pdo = new PDO($dsn, getenv('DB_USERNAME') ?: null, getenv('DB_PASSWORD') ?: null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 5,
        ]);
        $pdo->query('SELECT 1');

        return [
            'configured' => true,
            'connected' => true,
            'error' => null,
        ];
    } catch (Throwable $e) {
        return [
            'configured' => true,
            'connected' => false,
            'error' => 'Falha ao conectar no PostgreSQL.',
        ];
    }
}

function buildDsn(): ?string
{
    $databaseUrl = getenv('DATABASE_URL') ?: '';
    if ($databaseUrl !== '') {
        return convertDatabaseUrlToDsn($databaseUrl);
    }

    $host = getenv('DB_HOST') ?: '';
    $database = getenv('DB_DATABASE') ?: '';

    if ($host === '' || $database === '') {
        return null;
    }

    $port = getenv('DB_PORT') ?: '5432';
    $sslmode = getenv('DB_SSLMODE') ?: 'prefer';

    return sprintf(
        'pgsql:host=%s;port=%s;dbname=%s;sslmode=%s',
        $host,
        $port,
        $database,
        $sslmode
    );
}

function convertDatabaseUrlToDsn(string $url): ?string
{
    $parts = parse_url($url);
    if ($parts === false || empty($parts['host']) || empty($parts['path'])) {
        return null;
    }

    $database = ltrim($parts['path'], '/');
    $port = $parts['port'] ?? 5432;
    $sslmode = getenv('DB_SSLMODE') ?: 'prefer';

    if (!empty($parts['user'])) {
        putenv('DB_USERNAME=' . $parts['user']);
    }
    if (isset($parts['pass'])) {
        putenv('DB_PASSWORD=' . $parts['pass']);
    }

    return sprintf(
        'pgsql:host=%s;port=%s;dbname=%s;sslmode=%s',
        $parts['host'],
        $port,
        $database,
        $sslmode
    );
}

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
