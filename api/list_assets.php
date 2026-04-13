<?php
require_once __DIR__ . '/helpers.php';

$assets = [];

$collect = function($base, $folder, $types, $kind) use (&$assets) {
  if (!$base) {
    return;
  }
  $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base));
  foreach ($iterator as $file) {
    if ($file->isDir()) continue;
    $ext = strtolower(pathinfo($file->getFilename(), PATHINFO_EXTENSION));
    if (!in_array($ext, $types)) continue;

    $fullPath = $file->getPathname();
    $normalizedBase = str_replace('\\', '/', $base);
    $normalizedFull = str_replace('\\', '/', $fullPath);
    $rel = str_replace($normalizedBase, '', $normalizedFull);
    $rel = str_replace('\\', '/', $rel);
    if (substr($rel, 0, 1) === '/') {
      $rel = substr($rel, 1);
    }

    $assets[] = [
      'name' => pathinfo($file->getFilename(), PATHINFO_FILENAME),
      'path' => 'assets/' . $folder . '/' . $rel,
      'type' => $kind,
      'ext' => $ext,
    ];
  }
};

$collect(assets_root('models'), 'models', ['glb', 'gltf'], 'model');
$collect(assets_root('textures'), 'textures', ['png', 'jpg', 'jpeg'], 'texture');
$collect(assets_root('audio'), 'audio', ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'webm'], 'audio');

send_json($assets);
