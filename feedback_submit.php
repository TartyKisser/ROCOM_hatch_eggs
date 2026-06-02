<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'message' => 'method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$rawBody = file_get_contents('php://input') ?: '';
if (strlen($rawBody) > 8192) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'message' => 'content too large'], JSON_UNESCAPED_UNICODE);
    exit;
}

$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'invalid json'], JSON_UNESCAPED_UNICODE);
    exit;
}

$honeypot = trim((string)($payload['website'] ?? ''));
if ($honeypot !== '') {
    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

$allowedTypes = ['改进建议', '问题反馈', '想要功能'];
$type = trim((string)($payload['type'] ?? '改进建议'));
if (!in_array($type, $allowedTypes, true)) {
    $type = '改进建议';
}

$message = trim((string)($payload['message'] ?? ''));
$contact = trim((string)($payload['contact'] ?? ''));
$messageLength = function_exists('mb_strlen') ? mb_strlen($message, 'UTF-8') : strlen($message);

if ($messageLength < 5) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => 'message too short'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($messageLength > 1600) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => 'message too long'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (function_exists('mb_substr')) {
    $contact = mb_substr($contact, 0, 120, 'UTF-8');
} else {
    $contact = substr($contact, 0, 120);
}

$storageDir = __DIR__ . '/feedback_submissions';
if (!is_dir($storageDir) && !mkdir($storageDir, 0755, true) && !is_dir($storageDir)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => 'storage unavailable'], JSON_UNESCAPED_UNICODE);
    exit;
}

$record = [
    'createdAt' => date('c'),
    'type' => $type,
    'message' => $message,
    'contact' => $contact,
    'page' => (string)($_SERVER['HTTP_REFERER'] ?? ''),
    'userAgent' => (string)($_SERVER['HTTP_USER_AGENT'] ?? ''),
    'ipHash' => hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? '')),
];

$line = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
$feedbackFile = $storageDir . '/feedback_data.php';
$handle = fopen($feedbackFile, 'c+');

if ($handle === false || !flock($handle, LOCK_EX)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => 'save failed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$stats = fstat($handle);
if (($stats['size'] ?? 0) === 0) {
    fwrite($handle, "<?php exit; ?>\n");
}

fseek($handle, 0, SEEK_END);
$saved = fwrite($handle, $line);
fflush($handle);
flock($handle, LOCK_UN);
fclose($handle);

if ($saved === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => 'save failed'], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
