<?php
class SketchfabImportService {
  private $authService;
  private $apiService;
  private $httpClient;
  private $cache;
  private $importer;
  private $registry;

  public function __construct(SketchfabAuthService $authService, SketchfabApiService $apiService, SketchfabHttpClient $httpClient, SketchfabCache $cache, GlbImporter $importer, AssetRegistry $registry) {
    $this->authService = $authService;
    $this->apiService = $apiService;
    $this->httpClient = $httpClient;
    $this->cache = $cache;
    $this->importer = $importer;
    $this->registry = $registry;
  }

  public function importSketchfabModel($modelUid, array $options = []) {
    $modelUid = $this->apiService->extractModelUid($modelUid);
    if ($modelUid === '') {
      throw new SketchfabApiException('Model UID invalido.', 400, null, 'validate');
    }

    $reimport = !empty($options['reimport']);
    $existing = $this->registry->findByModelUid($modelUid);
    if (!$reimport && $this->registry->isRecordUsable($existing)) {
      return ['success' => true, 'fromCache' => true, 'message' => 'Asset reutilizado do cache local.', 'asset' => $existing, 'steps' => [['key' => 'cache', 'label' => 'Cache local', 'status' => 'ok']]];
    }

    $steps = [];
    $authorizationHeader = $this->authService->getAuthorizationHeader();
    $steps[] = ['key' => 'auth', 'label' => 'Autenticacao', 'status' => 'ok'];

    $model = $this->apiService->getModel($modelUid);
    $steps[] = ['key' => 'metadata', 'label' => 'Metadados', 'status' => 'ok'];

    $downloadPayload = $this->apiService->requestModelDownload($modelUid, $authorizationHeader);
    $selection = $this->selectDownload($downloadPayload);
    $steps[] = ['key' => 'download_request', 'label' => 'Permissao de download', 'status' => 'ok', 'format' => $selection['type']];

    $downloadPath = $this->downloadArchive($modelUid, $selection, $reimport);
    $steps[] = ['key' => 'download_file', 'label' => 'Download', 'status' => 'ok', 'path' => $downloadPath];

    $resolvedSource = $this->resolveSourceFile($modelUid, $selection, $downloadPath, $reimport);
    $steps[] = ['key' => 'extract', 'label' => 'Preparacao do arquivo', 'status' => 'ok', 'format' => $resolvedSource['type']];

    $imported = $this->importer->importSource($resolvedSource['path'], $resolvedSource['type'], $model, ['reimport' => $reimport]);
    $steps[] = ['key' => 'engine_import', 'label' => 'Importacao na engine', 'status' => 'ok', 'localFilePath' => $imported['localFilePath']];

    $record = $this->buildRegistryRecord($model, $imported, $resolvedSource['type']);
    $record = $this->registry->upsert($record);
    $steps[] = ['key' => 'registry', 'label' => 'Registro local', 'status' => 'ok'];

    return ['success' => true, 'fromCache' => false, 'message' => 'Asset Sketchfab importado com sucesso.', 'asset' => $record, 'steps' => $steps];
  }

  private function selectDownload(array $payload) {
    foreach (['glb', 'gltf'] as $preferred) {
      if (!empty($payload[$preferred]['url'])) {
        return ['type' => $preferred, 'url' => $payload[$preferred]['url'], 'size' => (int) ($payload[$preferred]['size'] ?? 0)];
      }
    }
    if (!empty($payload['usdz']['url'])) {
      throw new SketchfabApiException('O Sketchfab retornou apenas USDZ para este modelo. Sua engine esta configurada para GLB/glTF.', 422, $payload, 'download_request');
    }
    throw new SketchfabApiException('O Sketchfab nao retornou GLB nem glTF para este modelo.', 422, $payload, 'download_request');
  }

  private function downloadArchive($modelUid, array $selection, $reimport) {
    $downloadDir = $this->cache->getDownloadDirectory($modelUid);
    $extension = $selection['type'] === 'glb' ? 'glb' : 'zip';
    $targetPath = $downloadDir . DIRECTORY_SEPARATOR . 'asset.' . $extension;
    if (!$reimport && file_exists($targetPath) && filesize($targetPath) > 0) {
      return $targetPath;
    }
    $this->httpClient->downloadFile($selection['url'], $targetPath, ['timeout' => 180]);
    if (!file_exists($targetPath) || filesize($targetPath) <= 0) {
      throw new SketchfabApiException('O arquivo baixado do Sketchfab esta vazio ou corrompido.', 500, ['targetPath' => $targetPath], 'download_file');
    }
    return $targetPath;
  }

  private function resolveSourceFile($modelUid, array $selection, $downloadPath, $reimport) {
    if ($selection['type'] === 'glb') {
      return ['type' => 'glb', 'path' => $downloadPath];
    }
    if (!class_exists('ZipArchive')) {
      throw new SketchfabApiException('ZipArchive nao esta disponivel no PHP atual para extrair o pacote glTF.', 500, null, 'extract');
    }

    $extractDir = $reimport ? $this->cache->clearExtractDirectory($modelUid) : $this->cache->getExtractDirectory($modelUid);
    $zip = new ZipArchive();
    $opened = $zip->open($downloadPath);
    if ($opened !== true) {
      throw new SketchfabApiException('Falha ao abrir o ZIP baixado do Sketchfab.', 500, ['zipStatus' => $opened], 'extract');
    }
    $zip->extractTo($extractDir);
    $zip->close();

    $glbFile = $this->findFirstFileByExtensions($extractDir, ['glb']);
    if ($glbFile) return ['type' => 'glb', 'path' => $glbFile];
    $gltfFile = $this->findFirstFileByExtensions($extractDir, ['gltf']);
    if ($gltfFile) return ['type' => 'gltf', 'path' => $gltfFile];
    throw new SketchfabApiException('O ZIP baixado nao contem arquivo .glb nem .gltf.', 422, ['extractDir' => $extractDir], 'extract');
  }

  private function findFirstFileByExtensions($directory, array $extensions) {
    $found = [];
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $item) {
      if (!$item->isFile()) continue;
      $extension = strtolower((string) pathinfo($item->getFilename(), PATHINFO_EXTENSION));
      if (!in_array($extension, $extensions, true)) continue;
      $found[] = $item->getPathname();
    }
    if (!$found) return null;
    usort($found, function($left, $right) { return strlen($left) <=> strlen($right); });
    return $found[0];
  }

  private function buildRegistryRecord(array $model, array $imported, $sourceType) {
    $localAbsolutePath = $imported['localAbsolutePath'];
    $hash = is_file($localAbsolutePath) ? sha1_file($localAbsolutePath) : sha1($localAbsolutePath);
    return [
      'localId' => 'skfb_' . ($model['modelUid'] ?? uniqid()),
      'sketchfabModelUid' => $model['modelUid'] ?? '',
      'title' => $model['title'] ?? 'Sem nome',
      'authorName' => $model['authorName'] ?? 'Autor desconhecido',
      'licenseName' => $model['licenseName'] ?? 'Licenca desconhecida',
      'licenseUrl' => $model['licenseUrl'] ?? '',
      'sourceUrl' => $model['sourceUrl'] ?? '',
      'thumbnailUrl' => $model['thumbnailUrl'] ?? '',
      'localFilePath' => $imported['localFilePath'],
      'importedAt' => gmdate('c'),
      'hash' => $hash,
      'cacheKey' => sha1(($model['modelUid'] ?? '') . '|' . $imported['localFilePath'] . '|' . $hash),
      'importFormat' => $imported['format'] ?? $sourceType,
      'downloadSourceType' => $sourceType,
      'isAnimated' => !empty($model['isAnimated']),
      'animationCount' => max(0, (int) ($model['animationCount'] ?? 0)),
      'attribution' => trim(($model['authorName'] ?? '') . ' | ' . ($model['licenseName'] ?? '')),
    ];
  }
}
