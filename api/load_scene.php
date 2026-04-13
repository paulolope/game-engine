<?php
require_once __DIR__ . '/helpers.php';

$name = isset($_GET['name']) ? sanitize_filename($_GET['name']) : '';
if (!$name) {
  send_json(['error' => 'Nome de cena invalido'], 400);
}

$base = scenes_root();
if (!$base) {
  send_json(['error' => 'Pasta de cenas nao encontrada'], 500);
}

$file = $base . '/' . $name . '.json';
if (!file_exists($file)) {
  send_json(['error' => 'Cena nao encontrada'], 404);
}

$content = file_get_contents($file);
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('Content-Type: application/json; charset=utf-8');
echo $content;
