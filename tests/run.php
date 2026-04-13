<?php
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/auth/SketchfabAuthServiceTest.php';
require_once __DIR__ . '/api/SketchfabApiSearchTest.php';
require_once __DIR__ . '/download/SketchfabDownloadServiceTest.php';
require_once __DIR__ . '/download/ZipExtractorTest.php';
require_once __DIR__ . '/import/GlbImporterTest.php';

global $__tests;
$passed = 0;
$failed = 0;

foreach ($__tests as $test) {
  try {
    $test['fn']();
    $passed++;
    echo '[OK] ' . $test['name'] . PHP_EOL;
  } catch (Throwable $error) {
    $failed++;
    echo '[FAIL] ' . $test['name'] . ' -> ' . $error->getMessage() . PHP_EOL;
  }
}

echo PHP_EOL . 'Passed: ' . $passed . PHP_EOL;
echo 'Failed: ' . $failed . PHP_EOL;
exit($failed > 0 ? 1 : 0);
