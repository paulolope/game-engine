<?php
require_once __DIR__ . '/sketchfab_bootstrap.php';
require_post_method();

try {
  $services = sketchfab_services();
  $body = request_json_body();
  $modelUid = $body['modelUid'] ?? ($_POST['modelUid'] ?? '');
  $reimport = !empty($body['reimport']) || !empty($_POST['reimport']);
  $result = $services['import']->importSketchfabModel($modelUid, ['reimport' => $reimport]);
  send_json(array_merge(['ok' => true], $result));
} catch (Throwable $error) {
  $data = sketchfab_error_response($error, 'import');
  send_json($data, $data['statusCode'] ?: 500);
}
