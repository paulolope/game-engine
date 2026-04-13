<?php
require_once __DIR__ . '/../bootstrap.php';

test_case('api: search models applies official filters and normalizes cards', function() {
  $config = new SketchfabConfig(['defaultCount' => 12]);
  $http = new FakeHttpClient();
  $api = new SketchfabApiService($config, $http);

  $http->queueJson(200, [
    'results' => [[
      'uid' => '9d01f4bba4ba45088a21aac2ee134d5f',
      'name' => 'Bronze Stag',
      'description' => 'Sculpting practice',
      'isDownloadable' => true,
      'viewerUrl' => 'https://sketchfab.com/3d-models/bronze-stag-9d01f4bba4ba45088a21aac2ee134d5f',
      'user' => ['displayName' => 'Tim Skafte', 'username' => 'timskafte', 'profileUrl' => 'https://sketchfab.com/timskafte'],
      'license' => ['label' => 'CC Attribution'],
      'thumbnails' => ['images' => [['width' => 200, 'url' => 'small.jpg'], ['width' => 640, 'url' => 'big.jpg']]],
      'archives' => ['glb' => ['type' => 'glb'], 'gltf' => ['type' => 'gltf']],
      'faceCount' => 15782,
      'vertexCount' => 9278,
    ]],
    'cursors' => ['next' => '2', 'previous' => null],
  ]);

  $result = $api->searchModels(['q' => 'stag', 'file_format' => 'glb']);
  $request = $http->requests[0];
  assert_contains('type=models', $request['url']);
  assert_contains('downloadable=true', $request['url']);
  assert_contains('file_format=glb', $request['url']);
  assert_same('Bronze Stag', $result['results'][0]['title']);
  assert_same('big.jpg', $result['results'][0]['thumbnailUrl']);
  assert_same('2', $result['cursors']['next']);
});

test_case('api: auto format search keeps downloadable query without forcing GLB', function() {
  $config = new SketchfabConfig(['defaultCount' => 12]);
  $http = new FakeHttpClient();
  $api = new SketchfabApiService($config, $http);

  $http->queueJson(200, [
    'results' => [[
      'uid' => 'd8bf589af56144ab9cdeb7b5c9b95a47',
      'name' => 'Animated Wild Boar',
      'isDownloadable' => true,
      'viewerUrl' => 'https://sketchfab.com/3d-models/animated-wild-boar-3d-animal-model-d8bf589af56144ab9cdeb7b5c9b95a47',
      'user' => ['displayName' => 'Wildlife Artist'],
      'license' => ['label' => 'CC Attribution'],
      'thumbnails' => ['images' => [['width' => 640, 'url' => 'boar.jpg']]],
      'archives' => ['gltf' => ['type' => 'gltf']],
      'animationCount' => 3,
      'isAnimated' => true,
    ]],
    'cursors' => ['next' => null, 'previous' => null],
  ]);

  $result = $api->searchModels(['q' => 'wild boar', 'file_format' => 'auto']);
  $request = $http->requests[0];
  assert_contains('downloadable=true', $request['url']);
  assert_not_contains('file_format=', $request['url']);
  assert_same(true, $result['results'][0]['isAnimated']);
  assert_same(3, $result['results'][0]['animationCount']);
});

test_case('api: direct sketchfab model URL resolves exact model card', function() {
  $config = new SketchfabConfig(['defaultCount' => 12]);
  $http = new FakeHttpClient();
  $api = new SketchfabApiService($config, $http);

  $http->queueJson(200, [
    'uid' => 'd8bf589af56144ab9cdeb7b5c9b95a47',
    'name' => 'Animated Wild Boar',
    'isDownloadable' => true,
    'viewerUrl' => 'https://sketchfab.com/3d-models/animated-wild-boar-3d-animal-model-d8bf589af56144ab9cdeb7b5c9b95a47',
    'user' => ['displayName' => 'Wildlife Artist'],
    'license' => ['label' => 'CC Attribution'],
    'thumbnails' => ['images' => [['width' => 640, 'url' => 'boar.jpg']]],
    'archives' => ['gltf' => ['type' => 'gltf']],
    'animationCount' => 2,
  ]);

  $result = $api->searchModels([
    'q' => 'https://sketchfab.com/3d-models/animated-wild-boar-3d-animal-model-d8bf589af56144ab9cdeb7b5c9b95a47',
    'file_format' => 'auto',
  ]);

  $request = $http->requests[0];
  assert_contains('/models/d8bf589af56144ab9cdeb7b5c9b95a47', $request['url']);
  assert_not_contains('/search?', $request['url']);
  assert_same(1, count($result['results']));
  assert_same('Animated Wild Boar', $result['results'][0]['title']);
  assert_same(true, $result['results'][0]['isAnimated']);
});
