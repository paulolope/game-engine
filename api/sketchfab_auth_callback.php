<?php
require_once __DIR__ . '/sketchfab_bootstrap.php';

$code = $_GET['code'] ?? '';
$state = $_GET['state'] ?? '';
$errorMessage = $_GET['error_description'] ?? ($_GET['error'] ?? '');

try {
  if ($errorMessage !== '') {
    throw new SketchfabApiException('Login Sketchfab cancelado ou recusado: ' . $errorMessage, 400, null, 'auth_callback');
  }
  $services = sketchfab_services();
  $status = $services['auth']->handleCallback($code, $state);
  $payload = json_encode(['source' => 'sketchfab-oauth', 'ok' => true, 'status' => $status], JSON_UNESCAPED_SLASHES);
  send_html('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Sketchfab Login</title><body style="font-family:Arial,sans-serif;background:#101318;color:#fff;padding:24px"><h2>Sketchfab conectado</h2><p>Esta janela pode ser fechada.</p><script>const payload=' . $payload . '; if(window.opener){window.opener.postMessage(payload, window.location.origin); window.close();}</script></body></html>');
} catch (Throwable $error) {
  $data = sketchfab_error_response($error, 'auth_callback');
  $payload = json_encode(['source' => 'sketchfab-oauth', 'ok' => false, 'error' => $data['error']], JSON_UNESCAPED_SLASHES);
  send_html('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Sketchfab Login</title><body style="font-family:Arial,sans-serif;background:#101318;color:#fff;padding:24px"><h2>Falha no login Sketchfab</h2><p>' . htmlspecialchars($data['error'], ENT_QUOTES, 'UTF-8') . '</p><script>const payload=' . $payload . '; if(window.opener){window.opener.postMessage(payload, window.location.origin);}</script></body></html>', 400);
}
