<?php
require_once __DIR__ . '/../bootstrap.php';

test_case('download: import service stores direct GLB in assets and registry', function() {
  $tempRoot = make_temp_dir('skfb_glb_import');
  $imports = $tempRoot . DIRECTORY_SEPARATOR . 'imports';
  $registryPath = $tempRoot . DIRECTORY_SEPARATOR . 'registry.json';
  $downloadFile = $tempRoot . DIRECTORY_SEPARATOR . 'fixture.glb';
  file_put_contents($downloadFile, 'glTF-binary-placeholder');

  $cache = new SketchfabCache($tempRoot . DIRECTORY_SEPARATOR . 'cache', $imports, $registryPath);
  $registry = new AssetRegistry($registryPath);
  $http = new FakeHttpClient();
  $http->downloadSourcePath = $downloadFile;
  $auth = new FakeSketchfabAuthService();
  $api = new FakeSketchfabApiService();
  $api->model = [
    'modelUid' => 'bronze-stag-uid',
    'title' => 'Bronze Stag',
    'authorName' => 'Tim Skafte',
    'licenseName' => 'CC Attribution',
    'licenseUrl' => 'http://creativecommons.org/licenses/by/4.0/',
    'sourceUrl' => 'https://sketchfab.com/3d-models/bronze-stag-uid',
    'thumbnailUrl' => 'https://media.sketchfab.com/example.jpg',
  ];
  $api->download = ['glb' => ['url' => 'https://download.test/model.glb', 'size' => 1234]];

  $service = new SketchfabImportService($auth, $api, $http, $cache, new GlbImporter($cache), $registry);
  $result = $service->importSketchfabModel('bronze-stag-uid');

  assert_true($result['success'] === true, 'Import result should be successful');
  assert_same(false, $result['fromCache']);
  assert_true(file_exists(project_root($result['asset']['localFilePath'])), 'Imported GLB should exist in local assets');
  assert_same('CC Attribution', $result['asset']['licenseName']);

  remove_temp_dir($tempRoot);
});

test_case('download: import service accepts sketchfab URL and preserves animation metadata', function() {
  $tempRoot = make_temp_dir('skfb_glb_import_anim');
  $imports = $tempRoot . DIRECTORY_SEPARATOR . 'imports';
  $registryPath = $tempRoot . DIRECTORY_SEPARATOR . 'registry.json';
  $downloadFile = $tempRoot . DIRECTORY_SEPARATOR . 'fixture_anim.glb';
  file_put_contents($downloadFile, 'animated-glb-placeholder');

  $cache = new SketchfabCache($tempRoot . DIRECTORY_SEPARATOR . 'cache', $imports, $registryPath);
  $registry = new AssetRegistry($registryPath);
  $http = new FakeHttpClient();
  $http->downloadSourcePath = $downloadFile;
  $auth = new FakeSketchfabAuthService();
  $api = new FakeSketchfabApiService();
  $api->model = [
    'modelUid' => 'd8bf589af56144ab9cdeb7b5c9b95a47',
    'title' => 'Animated Wild Boar',
    'authorName' => 'Wildlife Artist',
    'licenseName' => 'CC Attribution',
    'licenseUrl' => 'http://creativecommons.org/licenses/by/4.0/',
    'sourceUrl' => 'https://sketchfab.com/3d-models/animated-wild-boar-3d-animal-model-d8bf589af56144ab9cdeb7b5c9b95a47',
    'thumbnailUrl' => 'https://media.sketchfab.com/boar.jpg',
    'isAnimated' => true,
    'animationCount' => 4,
  ];
  $api->download = ['glb' => ['url' => 'https://download.test/animated-boar.glb', 'size' => 4567]];

  $service = new SketchfabImportService($auth, $api, $http, $cache, new GlbImporter($cache), $registry);
  $result = $service->importSketchfabModel('https://sketchfab.com/3d-models/animated-wild-boar-3d-animal-model-d8bf589af56144ab9cdeb7b5c9b95a47');

  assert_true($result['success'] === true, 'Animated import result should be successful');
  assert_same(true, $result['asset']['isAnimated']);
  assert_same(4, $result['asset']['animationCount']);
  assert_same('d8bf589af56144ab9cdeb7b5c9b95a47', $result['asset']['sketchfabModelUid']);

  remove_temp_dir($tempRoot);
});
