<?php
require_once __DIR__ . '/helpers.php';

$base = assets_root('audio');
if (!$base) {
  send_json(['error' => 'Assets/audio folder not found'], 500);
}

$files = $_FILES['files'] ?? null;
if (!$files) {
  send_json(['error' => 'Nenhum arquivo enviado'], 400);
}

$paths = [];
if (isset($_POST['paths'])) {
  $paths = json_decode($_POST['paths'], true) ?: [];
}

$allowedExtensions = ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'webm'];
$saved = [];
$count = is_array($files['name']) ? count($files['name']) : 0;

for ($i = 0; $i < $count; $i++) {
  if (($files['error'][$i] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    continue;
  }

  $original = (string) ($files['name'][$i] ?? '');
  $extension = strtolower(pathinfo($original, PATHINFO_EXTENSION));
  if (!in_array($extension, $allowedExtensions, true)) {
    continue;
  }

  $rel = $paths[$i] ?? $original;
  $rel = str_replace('\\', '/', $rel);
  $rel = ltrim($rel, '/');
  if (strpos($rel, '..') !== false) {
    continue;
  }

  $target = $base . '/' . $rel;
  ensure_dir(dirname($target));

  if (!move_uploaded_file($files['tmp_name'][$i], $target)) {
    continue;
  }

  $saved[] = 'assets/audio/' . $rel;
}

if (!count($saved)) {
  send_json(['error' => 'Falha no upload de audio'], 400);
}

send_json(['saved' => $saved]);
