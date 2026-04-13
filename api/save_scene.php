<?php
require_once __DIR__ . '/helpers.php';

$payload = json_decode(file_get_contents('php://input'), true);
if (!$payload) {
  send_json(['error' => 'JSON invalido'], 400);
}

$name = sanitize_filename($payload['name'] ?? 'scene');
$scene = $payload['scene'] ?? null;
if (!$scene) {
  send_json(['error' => 'Cena ausente'], 400);
}

$base = scenes_root();
if (!$base) {
  send_json(['error' => 'Pasta de cenas nao encontrada'], 500);
}

$file = $base . '/' . $name . '.json';
file_put_contents($file, json_encode($scene, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

send_json(['saved' => $name]);
