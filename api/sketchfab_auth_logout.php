<?php
require_once __DIR__ . '/sketchfab_bootstrap.php';
require_post_method();

try {
  $services = sketchfab_services();
  $services['auth']->logout();
  send_json(['ok' => true]);
} catch (Throwable $error) {
  $data = sketchfab_error_response($error, 'auth_logout');
  send_json($data, $data['statusCode'] ?: 500);
}
