<?php
require_once __DIR__ . '/../bootstrap.php';

test_case('import: glb importer copies GLB source into local import folder', function() {
  $tempRoot = make_temp_dir('glb_importer');
  $imports = $tempRoot . DIRECTORY_SEPARATOR . 'imports';
  $registryPath = $tempRoot . DIRECTORY_SEPARATOR . 'registry.json';
  $sourceGlb = $tempRoot . DIRECTORY_SEPARATOR . 'source.glb';
  file_put_contents($sourceGlb, 'fake-glb-bytes');

  $cache = new SketchfabCache($tempRoot . DIRECTORY_SEPARATOR . 'cache', $imports, $registryPath);
  $importer = new GlbImporter($cache);
  $result = $importer->importSource($sourceGlb, 'glb', ['title' => 'Tree Stand', 'modelUid' => 'tree-stand-uid']);

  assert_true(file_exists(project_root($result['localFilePath'])), 'GLB importer should output local file');
  assert_same('glb', $result['format']);

  remove_temp_dir($tempRoot);
});
