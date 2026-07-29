<?php
declare(strict_types=1);

const UPSTREAM_ORIGIN = 'https://roco-eggs.tsuki-world.com';
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 45;

$endpoints = [
    'query' => [
        'path' => '/api/home/query',
        'ttl' => 60,
    ],
    'online-status' => [
        'path' => '/api/home/online-status',
        'ttl' => 20,
    ],
    'pet-details' => [
        'path' => '/api/home/pet-details',
        'ttl' => 30,
    ],
];

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST, OPTIONS');
    echo json_encode(['detail' => '只支持 POST 请求'], JSON_UNESCAPED_UNICODE);
    exit;
}

$action = $_GET['action'] ?? '';
if (!isset($endpoints[$action])) {
    http_response_code(404);
    echo json_encode(['detail' => '接口不存在'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!check_rate_limit()) {
    http_response_code(429);
    echo json_encode(['detail' => '请求过于频繁，请稍后再试'], JSON_UNESCAPED_UNICODE);
    exit;
}

$rawBody = file_get_contents('php://input') ?: '';
$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['detail' => '请求体必须是 JSON'], JSON_UNESCAPED_UNICODE);
    exit;
}

$uid = normalize_uid($payload['uid'] ?? null);
if ($uid === null) {
    http_response_code(400);
    echo json_encode(['detail' => '请输入正确的玩家 UID'], JSON_UNESCAPED_UNICODE);
    exit;
}

$refresh = !empty($payload['refresh']);
$endpoint = $endpoints[$action];
$cacheFile = sys_get_temp_dir() . '/rocom_home_' . md5($action . ':' . $uid) . '.json';

if (!$refresh && is_file($cacheFile) && time() - filemtime($cacheFile) < $endpoint['ttl']) {
    header('X-ROCOM-Home-Cache: HIT');
    readfile($cacheFile);
    exit;
}

$upstreamPayload = json_encode([
    'uid' => $uid,
    'refresh' => $refresh,
], JSON_UNESCAPED_UNICODE);

$context = stream_context_create([
    'http' => [
        'method' => 'POST',
        'timeout' => 8,
        'ignore_errors' => true,
        'header' => implode("\r\n", [
            'User-Agent: Mozilla/5.0 (ROCOM Tools Home PHP Proxy)',
            'Accept: application/json',
            'Accept-Language: zh-CN,zh;q=0.9',
            'Content-Type: application/json',
            'Origin: ' . UPSTREAM_ORIGIN,
            'Referer: ' . UPSTREAM_ORIGIN . '/home',
        ]),
        'content' => $upstreamPayload,
    ],
    'ssl' => [
        'verify_peer' => true,
        'verify_peer_name' => true,
    ],
]);

$url = UPSTREAM_ORIGIN . $endpoint['path'];
$responseBody = @file_get_contents($url, false, $context);
$statusCode = upstream_status_code($http_response_header ?? []);

if ($responseBody === false || trim($responseBody) === '') {
    http_response_code(502);
    echo json_encode(['detail' => '家园数据源暂时不可用'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!json_decode($responseBody, true) && json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(502);
    echo json_encode(['detail' => '家园数据源返回了非 JSON 响应'], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code($statusCode);
header('X-ROCOM-Home-Cache: MISS');

if (!$refresh && $statusCode >= 200 && $statusCode < 300) {
    file_put_contents($cacheFile, $responseBody, LOCK_EX);
}

echo $responseBody;

function normalize_uid($value): ?int
{
    $text = preg_replace('/\D+/', '', (string)($value ?? ''));
    if (!is_string($text) || !preg_match('/^\d{5,10}$/', $text)) {
        return null;
    }
    $uid = (int)$text;
    return $uid > 0 ? $uid : null;
}

function upstream_status_code(array $headers): int
{
    foreach ($headers as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})\b/', $header, $matches)) {
            return (int)$matches[1];
        }
    }
    return 200;
}

function check_rate_limit(): bool
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $file = sys_get_temp_dir() . '/rocom_home_rate_' . md5($ip) . '.json';
    $now = time();
    $state = ['window' => $now, 'count' => 0];

    if (is_file($file)) {
        $stored = json_decode((string)file_get_contents($file), true);
        if (is_array($stored) && isset($stored['window'], $stored['count'])) {
            $state = [
                'window' => (int)$stored['window'],
                'count' => (int)$stored['count'],
            ];
        }
    }

    if ($now - $state['window'] >= RATE_LIMIT_WINDOW_SECONDS) {
        $state = ['window' => $now, 'count' => 0];
    }

    $state['count']++;
    file_put_contents($file, json_encode($state), LOCK_EX);

    return $state['count'] <= RATE_LIMIT_MAX_REQUESTS;
}
