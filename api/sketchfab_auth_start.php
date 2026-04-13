<?php
require_once __DIR__ . '/sketchfab_bootstrap.php';

try {
  $services = sketchfab_services();
  $url = $services['auth']->beginAuthorization();
  header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
  header('Pragma: no-cache');
  header('Location: ' . $url, true, 302);
  exit;
} catch (Throwable $error) {
  $data = sketchfab_error_response($error, 'auth_start');
  send_html('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Sketchfab Login</title><body style="font-family:Arial,sans-serif;background:#101318;color:#fff;padding:24px"><h2>Falha ao iniciar login Sketchfab</h2><p>' . htmlspecialchars($data['error'], ENT_QUOTES, 'UTF-8') . '</p><script>if(window.opener){window.opener.postMessage({source:"sketchfab-oauth",ok:false,error:' . json_encode($data['error']) . '}, window.location.origin);}</script></body></html>', 500);
}
