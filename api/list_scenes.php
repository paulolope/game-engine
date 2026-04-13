<?php
require_once __DIR__ . '/helpers.php';

$base = scenes_root();
if (!$base) {
  send_json(['scenes' => []]);
}

$scenes = [];
foreach (glob($base . '/*.json') as $file) {
  $scenes[] = pathinfo($file, PATHINFO_FILENAME);
}

sort($scenes);

send_json(['scenes' => $scenes]);
