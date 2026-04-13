<?php
class GlbImporter {
  private $cache;

  public function __construct(SketchfabCache $cache) {
    $this->cache = $cache;
  }

  public function importSource($sourcePath, $sourceType, array $model, array $options = []) {
    if (!file_exists($sourcePath)) {
      throw new SketchfabApiException('Arquivo de origem do asset nao encontrado.', 500, ['sourcePath' => $sourcePath], 'import');
    }

    $slug = $this->cache->buildImportSlug($model['title'] ?? 'sketchfab-model', $model['modelUid'] ?? uniqid());
    $reimport = !empty($options['reimport']);
    $importsBase = $this->cache->getImportsPath();
    ensure_dir($importsBase);

    if ($sourceType === 'glb') {
      $targetAbsolute = $importsBase . DIRECTORY_SEPARATOR . $slug . '.glb';
      if ($reimport && file_exists($targetAbsolute)) @unlink($targetAbsolute);
      if (!copy($sourcePath, $targetAbsolute)) {
        throw new SketchfabApiException('Falha ao copiar GLB importado para assets/models.', 500, ['targetPath' => $targetAbsolute], 'import');
      }
      return ['localFilePath' => relative_project_path($targetAbsolute), 'localAbsolutePath' => $targetAbsolute, 'format' => 'glb', 'convertedToGlb' => false];
    }

    if ($sourceType !== 'gltf') {
      throw new SketchfabApiException('Formato retornado pelo Sketchfab nao suportado pela engine.', 422, ['sourceType' => $sourceType], 'import');
    }

    $targetGlbAbsolute = $importsBase . DIRECTORY_SEPARATOR . $slug . '.glb';
    if ($this->canConvertGltfToGlb()) {
      if ($reimport && file_exists($targetGlbAbsolute)) @unlink($targetGlbAbsolute);
      if ($this->convertGltfToGlb($sourcePath, $targetGlbAbsolute)) {
        return ['localFilePath' => relative_project_path($targetGlbAbsolute), 'localAbsolutePath' => $targetGlbAbsolute, 'format' => 'glb', 'convertedToGlb' => true];
      }
    }

    $rootDir = dirname($sourcePath);
    $targetDir = $importsBase . DIRECTORY_SEPARATOR . $slug;
    if ($reimport && file_exists($targetDir)) $this->cache->deleteRecursive($targetDir);
    $this->copyDirectory($rootDir, $targetDir);
    $targetGltfAbsolute = $targetDir . DIRECTORY_SEPARATOR . basename($sourcePath);
    return ['localFilePath' => relative_project_path($targetGltfAbsolute), 'localAbsolutePath' => $targetGltfAbsolute, 'format' => 'gltf', 'convertedToGlb' => false];
  }

  public function canConvertGltfToGlb() {
    return $this->detectTransformCommand() !== null;
  }

  private function convertGltfToGlb($sourcePath, $targetPath) {
    ensure_dir(dirname($targetPath));
    $command = $this->detectTransformCommand();
    if (!$command) return false;

    $process = proc_open(implode(' ', array_map('escapeshellarg', array_merge($command, ['copy', $sourcePath, $targetPath]))), [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, project_root());
    if (!is_resource($process)) return false;

    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);

    if ($exitCode !== 0 || !file_exists($targetPath)) {
      @unlink($targetPath);
      error_log('[Sketchfab] Falha ao converter glTF para GLB: ' . trim((string) ($stderr ?: $stdout)));
      return false;
    }

    return true;
  }

  private function detectTransformCommand() {
    $project = project_root();
    $windowsCli = $project . DIRECTORY_SEPARATOR . 'node_modules' . DIRECTORY_SEPARATOR . '.bin' . DIRECTORY_SEPARATOR . 'gltf-transform.cmd';
    $unixCli = $project . DIRECTORY_SEPARATOR . 'node_modules' . DIRECTORY_SEPARATOR . '.bin' . DIRECTORY_SEPARATOR . 'gltf-transform';
    $jsCli = $project . DIRECTORY_SEPARATOR . 'node_modules' . DIRECTORY_SEPARATOR . '@gltf-transform' . DIRECTORY_SEPARATOR . 'cli' . DIRECTORY_SEPARATOR . 'dist' . DIRECTORY_SEPARATOR . 'cli.js';
    if (is_windows() && file_exists($windowsCli)) return [$windowsCli];
    if (!is_windows() && file_exists($unixCli)) return [$unixCli];
    if (file_exists($jsCli)) return ['node', $jsCli];
    return null;
  }

  private function copyDirectory($sourceDir, $targetDir) {
    ensure_dir($targetDir);
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($sourceDir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
    foreach ($iterator as $item) {
      $source = $item->getPathname();
      $relative = substr($source, strlen($sourceDir) + 1);
      $target = $targetDir . DIRECTORY_SEPARATOR . $relative;
      if ($item->isDir()) {
        ensure_dir($target);
      } else {
        ensure_dir(dirname($target));
        copy($source, $target);
      }
    }
  }
}
