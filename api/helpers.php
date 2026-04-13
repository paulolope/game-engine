<?php
function send_json($data, $status = 200) {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  exit;
}

function send_html($html, $status = 200) {
  http_response_code($status);
  header('Content-Type: text/html; charset=utf-8');
  echo $html;
  exit;
}

function ensure_dir($path) {
  if (!file_exists($path)) {
    mkdir($path, 0777, true);
  }
}

function sanitize_filename($name) {
  $name = trim($name);
  $name = preg_replace('/[^a-zA-Z0-9_-]/', '_', $name);
  $name = substr($name, 0, 64);
  return $name ?: 'scene';
}

function project_root($path = '') {
  $root = realpath(__DIR__ . '/..');
  if (!$root) {
    $root = dirname(__DIR__);
  }
  if ($path === '' || $path === null) {
    return $root;
  }
  return rtrim($root, '/\\') . DIRECTORY_SEPARATOR . ltrim($path, '/\\');
}

function assets_root($folder = 'models') {
  $base = __DIR__ . '/../assets/' . $folder;
  if (!file_exists($base)) {
    ensure_dir($base);
  }
  $resolved = realpath($base);
  return $resolved ?: $base;
}

function scenes_root() {
  return realpath(__DIR__ . '/../data/scenes');
}

function data_root($path = '') {
  $base = project_root('data');
  ensure_dir($base);
  if ($path === '' || $path === null) {
    return $base;
  }
  $target = $base . DIRECTORY_SEPARATOR . ltrim($path, '/\\');
  $dir = pathinfo($target, PATHINFO_EXTENSION) ? dirname($target) : $target;
  ensure_dir($dir);
  return $target;
}

function cache_root($path = '') {
  return data_root($path ? ('cache/' . ltrim($path, '/\\')) : 'cache');
}

function normalize_slashes($value) {
  return str_replace('\\', '/', (string) $value);
}

function relative_project_path($absolutePath) {
  $root = normalize_slashes(project_root());
  $absolute = normalize_slashes($absolutePath);
  if (strpos($absolute, $root) === 0) {
    return ltrim(substr($absolute, strlen($root)), '/');
  }
  return ltrim($absolute, '/');
}

function read_json_file($path, $default = []) {
  if (!is_file($path)) {
    return $default;
  }
  $content = file_get_contents($path);
  if ($content === false || $content === '') {
    return $default;
  }
  $decoded = json_decode($content, true);
  return is_array($decoded) ? $decoded : $default;
}

function write_json_file($path, $data) {
  ensure_dir(dirname($path));
  $encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  if ($encoded === false) {
    throw new RuntimeException('Falha ao serializar JSON.');
  }
  if (file_put_contents($path, $encoded . PHP_EOL, LOCK_EX) === false) {
    throw new RuntimeException('Falha ao gravar arquivo JSON.');
  }
}

function parse_env_file($path) {
  static $cache = [];
  if (array_key_exists($path, $cache)) {
    return $cache[$path];
  }

  $values = [];
  if (!is_file($path)) {
    $cache[$path] = $values;
    return $values;
  }

  $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
  if (!is_array($lines)) {
    $cache[$path] = $values;
    return $values;
  }

  foreach ($lines as $line) {
    $trimmed = trim($line);
    if ($trimmed === '' || strpos($trimmed, '#') === 0) {
      continue;
    }
    $parts = explode('=', $trimmed, 2);
    if (count($parts) !== 2) {
      continue;
    }
    $key = trim($parts[0]);
    $value = trim($parts[1]);
    if ($value !== '' && (($value[0] === '"' && substr($value, -1) === '"') || ($value[0] === "'" && substr($value, -1) === "'"))) {
      $value = substr($value, 1, -1);
    }
    if ($key !== '') {
      $values[$key] = $value;
    }
  }

  $cache[$path] = $values;
  return $values;
}

function env_value($key, $default = null) {
  $value = getenv($key);
  if ($value !== false) {
    return $value;
  }
  $values = parse_env_file(project_root('.env'));
  if (array_key_exists($key, $values)) {
    return $values[$key];
  }
  return $default;
}

function session_bootstrap() {
  if (session_status() === PHP_SESSION_ACTIVE) {
    return;
  }
  session_name('game_engine3d');
  session_set_cookie_params([
    'httponly' => true,
    'samesite' => 'Lax',
  ]);
  session_start();
}

function request_json_body() {
  $raw = file_get_contents('php://input');
  if ($raw === false || trim($raw) === '') {
    return [];
  }
  $decoded = json_decode($raw, true);
  return is_array($decoded) ? $decoded : [];
}

function require_post_method() {
  if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    send_json(['error' => 'Metodo nao permitido'], 405);
  }
}

function is_windows() {
  return DIRECTORY_SEPARATOR === '\\';
}

ensure_dir(__DIR__ . '/../assets/models');
ensure_dir(__DIR__ . '/../assets/textures');
ensure_dir(__DIR__ . '/../assets/audio');
ensure_dir(__DIR__ . '/../data/scenes');
ensure_dir(project_root('modules'));
ensure_dir(cache_root('sketchfab'));
