<?php
require_once __DIR__ . '/helpers.php';

$payload = json_decode(file_get_contents('php://input'), true);
$path = isset($payload['path']) ? trim((string) $payload['path']) : '';
$path = str_replace('\\', '/', $path);

if (!$path) {
  send_json(['error' => 'Path do asset ausente'], 400);
}

if (strpos($path, '..') !== false) {
  send_json(['error' => 'Path invalido'], 400);
}

$allowedPrefixes = ['assets/models/', 'assets/textures/', 'assets/audio/'];
$isAllowed = false;
foreach ($allowedPrefixes as $prefix) {
  if (strpos($path, $prefix) === 0) {
    $isAllowed = true;
    break;
  }
}
if (!$isAllowed) {
  send_json(['error' => 'Asset fora das pastas permitidas'], 400);
}

$projectRoot = realpath(__DIR__ . '/..');
if (!$projectRoot) {
  send_json(['error' => 'Pasta do projeto nao encontrada'], 500);
}

$target = realpath($projectRoot . '/' . $path);
if (!$target || !file_exists($target)) {
  send_json(['error' => 'Asset nao encontrado'], 404);
}

$assetsRoot = realpath($projectRoot . '/assets');
$normalizedTarget = str_replace('\\', '/', $target);
$normalizedAssetsRoot = str_replace('\\', '/', $assetsRoot ?: '');
if (!$assetsRoot || strpos($normalizedTarget, $normalizedAssetsRoot . '/') !== 0) {
  send_json(['error' => 'Asset fora da pasta assets'], 400);
}

if (!is_file($target)) {
  send_json(['error' => 'Somente arquivos podem ser removidos'], 400);
}

$targets = [$target];
$ext = strtolower(pathinfo($target, PATHINFO_EXTENSION));
if ($ext === 'gltf') {
  $dir = dirname($target);
  $basename = pathinfo($target, PATHINFO_FILENAME);
  $allowedSidecars = ['bin', 'png', 'jpg', 'jpeg', 'webp', 'ktx2', 'ktx', 'dds', 'tga', 'bmp', 'gif'];
  $siblings = glob($dir . '/' . $basename . '.*') ?: [];
  foreach ($siblings as $candidate) {
    if (!is_file($candidate) || $candidate === $target) {
      continue;
    }
    $candidateExt = strtolower(pathinfo($candidate, PATHINFO_EXTENSION));
    if (in_array($candidateExt, $allowedSidecars, true)) {
      $targets[] = $candidate;
    }
  }
}

$targets = array_values(array_unique($targets));
$deleted = [];
foreach ($targets as $file) {
  if (!is_file($file)) {
    continue;
  }
  if (!@unlink($file)) {
    continue;
  }
  $normalizedFile = str_replace('\\', '/', $file);
  $relative = ltrim(str_replace(str_replace('\\', '/', $projectRoot), '', $normalizedFile), '/');
  $deleted[] = $relative;
}

if (!count($deleted)) {
  send_json(['error' => 'Falha ao remover asset'], 500);
}

$stopDirs = [
  realpath($projectRoot . '/assets/models'),
  realpath($projectRoot . '/assets/textures'),
  realpath($projectRoot . '/assets/audio'),
];
$dir = dirname($target);
while ($dir && file_exists($dir)) {
  $resolvedDir = realpath($dir);
  if (!$resolvedDir) {
    break;
  }
  if (in_array($resolvedDir, $stopDirs, true)) {
    break;
  }
  $entries = scandir($resolvedDir);
  if ($entries === false || count($entries) > 2) {
    break;
  }
  if (!@rmdir($resolvedDir)) {
    break;
  }
  $dir = dirname($resolvedDir);
}

send_json(['deleted' => $deleted]);
