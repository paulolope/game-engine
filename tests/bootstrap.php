<?php
require_once __DIR__ . '/../api/sketchfab_bootstrap.php';

$__tests = [];

function test_case($name, callable $fn) {
  global $__tests;
  $__tests[] = ['name' => $name, 'fn' => $fn];
}

function assert_true($condition, $message = 'Assertion failed') {
  if (!$condition) {
    throw new RuntimeException($message);
  }
}

function assert_same($expected, $actual, $message = '') {
  if ($expected !== $actual) {
    $label = $message !== '' ? $message : 'Values are not identical';
    throw new RuntimeException($label . ' | expected=' . var_export($expected, true) . ' actual=' . var_export($actual, true));
  }
}

function assert_contains($needle, $haystack, $message = '') {
  if (strpos((string) $haystack, (string) $needle) === false) {
    throw new RuntimeException($message !== '' ? $message : 'String does not contain expected fragment: ' . $needle);
  }
}

function assert_not_contains($needle, $haystack, $message = '') {
  if (strpos((string) $haystack, (string) $needle) !== false) {
    throw new RuntimeException($message !== '' ? $message : 'String contains unexpected fragment: ' . $needle);
  }
}

function make_temp_dir($prefix) {
  $dir = cache_root('test_tmp/' . $prefix . '_' . uniqid());
  ensure_dir($dir);
  return $dir;
}

function remove_temp_dir($path) {
  $cache = new SketchfabCache();
  $cache->deleteRecursive($path);
}

class FakeHttpClient extends SketchfabHttpClient {
  public $requests = [];
  public $queuedResponses = [];
  public $downloadSourcePath = null;

  public function queueJson($status, array $data) {
    $this->queuedResponses[] = ['status' => $status, 'headers' => [], 'data' => $data];
  }

  public function requestJson($method, $url, array $options = []) {
    $this->requests[] = ['method' => $method, 'url' => $url, 'options' => $options];
    if (!$this->queuedResponses) {
      throw new RuntimeException('No queued HTTP response for ' . $url);
    }
    return array_shift($this->queuedResponses);
  }

  public function downloadFile($url, $targetPath, array $options = []) {
    $this->requests[] = ['method' => 'DOWNLOAD', 'url' => $url, 'options' => $options];
    ensure_dir(dirname($targetPath));
    if ($this->downloadSourcePath) {
      copy($this->downloadSourcePath, $targetPath);
    } else {
      file_put_contents($targetPath, 'fake-download');
    }
    return ['status' => 200, 'headers' => [], 'path' => $targetPath];
  }
}

class FakeSketchfabAuthService extends SketchfabAuthService {
  public $token = 'fake-token';
  public function __construct() {}
  public function getValidAccessToken() { return $this->token; }
  public function getAuthorizationHeader() { return 'Bearer ' . $this->token; }
  public function getStatus() { return ['configured' => true, 'authenticated' => true, 'authMode' => 'oauth', 'loginAvailable' => true]; }
}

class FakeSketchfabApiService extends SketchfabApiService {
  public $model = [];
  public $download = [];
  public function __construct() {}
  public function getModel($uid) { return $this->model; }
  public function requestModelDownload($uid, $authorizationHeader) { return $this->download; }
}
