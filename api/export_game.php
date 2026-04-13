<?php
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  send_json(['error' => 'Metodo nao permitido'], 405);
}

if (!class_exists('ZipArchive')) {
  send_json(['error' => 'Extensao ZipArchive nao disponivel no PHP. Ative zip no servidor.'], 500);
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
  send_json(['error' => 'JSON invalido'], 400);
}

$sceneName = sanitize_filename($payload['scene'] ?? '');
if (!$sceneName) {
  send_json(['error' => 'Cena invalida para exportacao'], 400);
}

$scenesDir = scenes_root();
if (!$scenesDir) {
  send_json(['error' => 'Pasta de cenas nao encontrada'], 500);
}

$sceneFile = $scenesDir . '/' . $sceneName . '.json';
if (!file_exists($sceneFile)) {
  send_json(['error' => 'Cena nao encontrada para exportacao'], 404);
}

function rrmdir_export($dir) {
  if (!is_dir($dir)) return;
  $items = scandir($dir);
  foreach ($items as $item) {
    if ($item === '.' || $item === '..') continue;
    $path = $dir . DIRECTORY_SEPARATOR . $item;
    if (is_dir($path)) {
      rrmdir_export($path);
    } else {
      @unlink($path);
    }
  }
  @rmdir($dir);
}

function ensure_parent_dir_export($path) {
  $parent = dirname($path);
  if (!file_exists($parent)) {
    mkdir($parent, 0777, true);
  }
}

function copy_file_export($src, $dst) {
  if (!file_exists($src)) return false;
  ensure_parent_dir_export($dst);
  return copy($src, $dst);
}

function copy_dir_export($src, $dst) {
  if (!is_dir($src)) return;
  if (!file_exists($dst)) {
    mkdir($dst, 0777, true);
  }
  $items = scandir($src);
  foreach ($items as $item) {
    if ($item === '.' || $item === '..') continue;
    $srcPath = $src . DIRECTORY_SEPARATOR . $item;
    $dstPath = $dst . DIRECTORY_SEPARATOR . $item;
    if (is_dir($srcPath)) {
      copy_dir_export($srcPath, $dstPath);
    } else {
      copy_file_export($srcPath, $dstPath);
    }
  }
}

function add_dir_to_zip_export($zip, $folder, $base) {
  $items = scandir($folder);
  foreach ($items as $item) {
    if ($item === '.' || $item === '..') continue;
    $fullPath = $folder . DIRECTORY_SEPARATOR . $item;
    $localPath = ltrim(str_replace('\\', '/', substr($fullPath, strlen($base))), '/');
    if (is_dir($fullPath)) {
      $zip->addEmptyDir($localPath);
      add_dir_to_zip_export($zip, $fullPath, $base);
    } else {
      $zip->addFile($fullPath, $localPath);
    }
  }
}

function build_export_boot_script($mainSceneName) {
  $config = [
    'exported' => true,
    'cleanUrl' => true,
    'view' => 'game',
    'visual' => 'game',
    'menu' => 'start',
    'mainSceneName' => $mainSceneName,
  ];

  return 'window.__GAME_BOOT_CONFIG__ = ' .
    json_encode($config, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) .
    ';';
}

$root = realpath(__DIR__ . '/..');
$tmpBase = sys_get_temp_dir() . '/game_export_' . uniqid();
$packageRoot = $tmpBase . '/package';

try {
  ensure_dir($packageRoot);

  // Runtime files
  copy_dir_export($root . '/js', $packageRoot . '/js');
  copy_dir_export($root . '/css', $packageRoot . '/css');
  copy_dir_export($root . '/assets', $packageRoot . '/assets');

  // API mínima necessária para carregar cena.
  ensure_dir($packageRoot . '/api');
  copy_file_export($root . '/api/helpers.php', $packageRoot . '/api/helpers.php');
  copy_file_export($root . '/api/load_scene.php', $packageRoot . '/api/load_scene.php');
  copy_file_export($root . '/api/list_scenes.php', $packageRoot . '/api/list_scenes.php');

  // Exporta todas as cenas disponíveis do projeto.
  copy_dir_export($root . '/data/scenes', $packageRoot . '/data/scenes');

  // Usa o mesmo runtime da tela game.php como entrada do build exportado.
  copy_file_export($root . '/game.php', $packageRoot . '/index.php');
  file_put_contents($packageRoot . '/game.boot.js', build_export_boot_script('hunter'));
  file_put_contents(
    $packageRoot . '/README.txt',
    "Export do jogo\n\n" .
    "Cena selecionada no export: {$sceneName}\n" .
    "Cenas incluídas: todas as disponíveis em data/scenes\n\n" .
    "Como rodar:\n" .
    "1) Extraia o ZIP.\n" .
    "2) Coloque a pasta em um servidor com PHP (ex: MAMP/XAMPP).\n" .
    "3) Abra index.php no navegador.\n"
  );

  $zipName = 'game_export_' . $sceneName . '.zip';
  $zipPath = $tmpBase . '/' . $zipName;
  $zip = new ZipArchive();
  $opened = $zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
  if ($opened !== true) {
    throw new Exception('Falha ao criar ZIP');
  }
  add_dir_to_zip_export($zip, $packageRoot, $packageRoot);
  $zip->close();

  if (!file_exists($zipPath)) {
    throw new Exception('ZIP nao foi gerado');
  }

  header('Content-Type: application/zip');
  header('Content-Disposition: attachment; filename="' . $zipName . '"');
  header('Content-Length: ' . filesize($zipPath));
  header('Cache-Control: no-store, no-cache, must-revalidate');
  readfile($zipPath);
} catch (Throwable $e) {
  rrmdir_export($tmpBase);
  send_json(['error' => 'Falha ao exportar jogo: ' . $e->getMessage()], 500);
}

rrmdir_export($tmpBase);
exit;
