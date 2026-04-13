<?php
require_once __DIR__ . '/../bootstrap.php';

test_case('unzip: import service extracts glTF ZIP and keeps scene.gltf when GLB conversion is unavailable', function() {
  $tempRoot = make_temp_dir('skfb_zip_import');
  $imports = $tempRoot . DIRECTORY_SEPARATOR . 'imports';
  $registryPath = $tempRoot . DIRECTORY_SEPARATOR . 'registry.json';
  $zipPath = $tempRoot . DIRECTORY_SEPARATOR . 'fixture.zip';
  $zip = new ZipArchive();
  $zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
  $zip->addFromString('scene.gltf', '{"asset":{"version":"2.0"},"buffers":[],"meshes":[],"nodes":[],"scenes":[{"nodes":[]}],"scene":0}');
  $zip->addFromString('textures/readme.txt', 'texture placeholder');
  $zip->close();

  $cache = new SketchfabCache($tempRoot . DIRECTORY_SEPARATOR . 'cache', $imports, $registryPath);
  $registry = new AssetRegistry($registryPath);
  $http = new FakeHttpClient();
  $http->downloadSourcePath = $zipPath;
  $auth = new FakeSketchfabAuthService();
  $api = new FakeSketchfabApiService();
  $api->model = [
    'modelUid' => 'zip-stag-uid',
    'title' => 'Zip Stag',
    'authorName' => 'Field Works',
    'licenseName' => 'CC Attribution',
    'sourceUrl' => 'https://sketchfab.com/3d-models/zip-stag-uid',
    'thumbnailUrl' => 'https://media.sketchfab.com/example.jpg',
  ];
  $api->download = ['gltf' => ['url' => 'https://download.test/model.zip', 'size' => 9876]];

  $importer = new class($cache) extends GlbImporter {
    public function canConvertGltfToGlb() { return false; }
  };

  $service = new SketchfabImportService($auth, $api, $http, $cache, $importer, $registry);
  $result = $service->importSketchfabModel('zip-stag-uid');
  assert_contains('.gltf', $result['asset']['localFilePath']);
  assert_true(file_exists(project_root($result['asset']['localFilePath'])), 'Extracted glTF should exist in local assets');

  remove_temp_dir($tempRoot);
});
