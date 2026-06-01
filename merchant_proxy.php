<?php
declare(strict_types=1);

const MERCHANT_SOURCE_URL = 'https://www.onebiji.com/hykb_tools/comm/lkwgmerchant/preview.php?id=1&immgj=0';
const CACHE_TTL_SECONDS = 180;

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: public, max-age=120');

$cacheFile = sys_get_temp_dir() . '/rocom_merchant_' . md5(MERCHANT_SOURCE_URL) . '.html';

if (is_file($cacheFile) && time() - filemtime($cacheFile) < CACHE_TTL_SECONDS) {
    readfile($cacheFile);
    exit;
}

$context = stream_context_create([
    'http' => [
        'method' => 'GET',
        'timeout' => 8,
        'ignore_errors' => true,
        'header' => implode("\r\n", [
            'User-Agent: Mozilla/5.0 (ROCOM Tools Merchant Proxy)',
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language: zh-CN,zh;q=0.9',
        ]),
    ],
    'ssl' => [
        'verify_peer' => true,
        'verify_peer_name' => true,
    ],
]);

$html = @file_get_contents(MERCHANT_SOURCE_URL, false, $context);

if ($html === false || trim($html) === '') {
    http_response_code(502);
    echo '<!doctype html><meta charset="utf-8"><title>merchant proxy error</title>远行商人数据获取失败';
    exit;
}

file_put_contents($cacheFile, $html, LOCK_EX);
echo $html;
