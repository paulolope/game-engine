<?php
require_once __DIR__ . '/helpers.php';

$payload = json_decode(file_get_contents('php://input'), true);
if (!$payload) {
  send_json(['error' => 'JSON invalido'], 400);
}

$name = sanitize_filename($payload['name'] ?? '');
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

if (!is_file($file)) {
  send_json(['error' => 'Caminho invalido para cena'], 400);
}

if (!@unlink($file)) {
  send_json(['error' => 'Falha ao excluir cena'], 500);
}

send_json(['deleted' => $name]);
