<?php
require_once __DIR__ . '/helpers.php';

$base = assets_root('textures');
if (!$base) {
  send_json(['error' => 'Textures folder not found'], 500);
}

$files = $_FILES['files'] ?? null;
if (!$files) {
  send_json(['error' => 'Nenhum arquivo enviado'], 400);
}

$paths = [];
if (isset($_POST['paths'])) {
  $paths = json_decode($_POST['paths'], true) ?: [];
}

$saved = [];
$names = is_array($files['name']) ? $files['name'] : [$files['name']];
$tmpNames = is_array($files['tmp_name']) ? $files['tmp_name'] : [$files['tmp_name']];
$errors = is_array($files['error']) ? $files['error'] : [$files['error']];
$count = count($names);
$allowed = ['png', 'jpg', 'jpeg'];

for ($i = 0; $i < $count; $i++) {
  if ($errors[$i] !== UPLOAD_ERR_OK) {
    continue;
  }

  $original = $names[$i];
  $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
  if (!in_array($ext, $allowed)) {
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

  if (!move_uploaded_file($tmpNames[$i], $target)) {
    if (!copy($tmpNames[$i], $target)) {
      continue;
    }
  }

  $saved[] = 'assets/textures/' . $rel;
}

if (!count($saved)) {
  send_json(['error' => 'Falha ao salvar textura'], 500);
}

send_json(['saved' => $saved]);
