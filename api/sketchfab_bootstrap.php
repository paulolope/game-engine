<?php
require_once __DIR__ . '/helpers.php';
require_once project_root('modules/sketchfab_api/SketchfabApiException.php');
require_once project_root('modules/sketchfab_auth/SketchfabConfig.php');
require_once project_root('modules/sketchfab_api/SketchfabHttpClient.php');
require_once project_root('modules/sketchfab_auth/SketchfabAuthService.php');
require_once project_root('modules/sketchfab_api/SketchfabApiService.php');
require_once project_root('modules/sketchfab_cache/SketchfabCache.php');
require_once project_root('modules/asset_registry/AssetRegistry.php');
require_once project_root('modules/glb_importer/GlbImporter.php');
require_once project_root('modules/sketchfab_download/SketchfabImportService.php');

function sketchfab_services() {
  static $services = null;
  if ($services !== null) return $services;

  $config = SketchfabConfig::fromEnv();
  $httpClient = new SketchfabHttpClient();
  $cache = new SketchfabCache();
  $registry = new AssetRegistry($cache->getRegistryPath());
  $auth = new SketchfabAuthService($config, $httpClient);
  $api = new SketchfabApiService($config, $httpClient);
  $import = new SketchfabImportService($auth, $api, $httpClient, $cache, new GlbImporter($cache), $registry);

  $services = [
    'config' => $config,
    'http' => $httpClient,
    'cache' => $cache,
    'registry' => $registry,
    'auth' => $auth,
    'api' => $api,
    'import' => $import,
  ];
  return $services;
}

function sketchfab_error_response(Throwable $error, $defaultStage = 'request') {
  if ($error instanceof SketchfabApiException) {
    return [
      'ok' => false,
      'error' => $error->getMessage(),
      'stage' => $error->getStage() ?: $defaultStage,
      'statusCode' => $error->getStatusCode(),
      'details' => $error->getResponseData(),
    ];
  }

  return [
    'ok' => false,
    'error' => $error->getMessage() ?: 'Erro interno no Sketchfab Browser.',
    'stage' => $defaultStage,
    'statusCode' => 500,
  ];
}
