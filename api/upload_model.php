<?php
require_once __DIR__ . '/helpers.php';

$base = assets_root();
if (!$base) {
  send_json(['error' => 'Assets folder not found'], 500);
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
$count = is_array($files['name']) ? count($files['name']) : 0;

for ($i = 0; $i < $count; $i++) {
  if ($files['error'][$i] !== UPLOAD_ERR_OK) {
    continue;
  }

  $original = $files['name'][$i];
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

  $saved[] = 'assets/models/' . $rel;
}

send_json(['saved' => $saved]);
