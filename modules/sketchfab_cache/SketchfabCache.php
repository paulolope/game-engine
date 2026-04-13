<?php
class SketchfabCache {
  private $basePath;
  private $importsPath;
  private $registryPath;

  public function __construct($basePath = null, $importsPath = null, $registryPath = null) {
    $this->basePath = $basePath ?: cache_root('sketchfab');
    $this->importsPath = $importsPath ?: assets_root('models') . DIRECTORY_SEPARATOR . 'sketchfab';
    $this->registryPath = $registryPath ?: data_root('sketchfab_asset_registry.json');
    ensure_dir($this->basePath);
    ensure_dir($this->importsPath);
  }

  public function getBasePath() {
    return $this->basePath;
  }

  public function getImportsPath() {
    return $this->importsPath;
  }

  public function getRegistryPath() {
    return $this->registryPath;
  }

  public function getModelCachePath($modelUid) {
    $path = $this->basePath . DIRECTORY_SEPARATOR . sanitize_filename($modelUid);
    ensure_dir($path);
    return $path;
  }

  public function getDownloadDirectory($modelUid) {
    $path = $this->getModelCachePath($modelUid) . DIRECTORY_SEPARATOR . 'download';
    ensure_dir($path);
    return $path;
  }

  public function getExtractDirectory($modelUid) {
    $path = $this->getModelCachePath($modelUid) . DIRECTORY_SEPARATOR . 'extract';
    ensure_dir($path);
    return $path;
  }

  public function clearExtractDirectory($modelUid) {
    $path = $this->getModelCachePath($modelUid) . DIRECTORY_SEPARATOR . 'extract';
    $this->deleteRecursive($path);
    ensure_dir($path);
    return $path;
  }

  public function buildImportSlug($title, $modelUid) {
    $title = trim((string) $title);
    $slug = preg_replace('/[^a-z0-9]+/i', '-', strtolower($title));
    $slug = trim((string) $slug, '-');
    if ($slug === '') $slug = 'sketchfab-model';
    return $slug . '-' . substr(sanitize_filename($modelUid), 0, 10);
  }

  public function deleteRecursive($target) {
    if (!$target || !file_exists($target)) return;
    if (is_file($target) || is_link($target)) {
      @unlink($target);
      return;
    }
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($target, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($iterator as $item) {
      if ($item->isDir()) @rmdir($item->getPathname()); else @unlink($item->getPathname());
    }
    @rmdir($target);
  }
}
