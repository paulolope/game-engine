<?php
require_once __DIR__ . '/sketchfab_bootstrap.php';

try {
  $services = sketchfab_services();
  send_json(['ok' => true, 'status' => $services['auth']->getStatus()]);
} catch (Throwable $error) {
  $data = sketchfab_error_response($error, 'auth_status');
  send_json($data, $data['statusCode'] ?: 500);
}
