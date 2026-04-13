<?php
require_once __DIR__ . '/../bootstrap.php';

test_case('auth: authorization code flow stores token and user', function() {
  $_SESSION = [];
  $config = new SketchfabConfig([
    'clientId' => 'client-123',
    'clientSecret' => 'secret-456',
    'redirectUri' => 'http://localhost/GAME-ENGINE3D/api/sketchfab_auth_callback.php',
  ]);
  $http = new FakeHttpClient();
  $auth = new SketchfabAuthService($config, $http);

  $url = $auth->beginAuthorization();
  assert_contains('https://sketchfab.com/oauth2/authorize/?', $url, 'Authorization URL should use official Sketchfab endpoint');
  assert_contains('response_type=code', $url);
  $state = $_SESSION[SketchfabAuthService::STATE_KEY] ?? '';
  assert_true($state !== '', 'OAuth state should be stored in session');

  $http->queueJson(200, [
    'access_token' => 'token-abc',
    'refresh_token' => 'refresh-xyz',
    'expires_in' => 3600,
    'token_type' => 'Bearer',
  ]);
  $http->queueJson(200, [
    'uid' => 'user-1',
    'username' => 'hunter',
    'displayName' => 'Hunter User',
    'profileUrl' => 'https://sketchfab.com/hunter',
  ]);

  $status = $auth->handleCallback('code-123', $state);
  assert_true($status['authenticated'] === true, 'User should be authenticated after callback');
  assert_same('Hunter User', $status['user']['displayName']);
});

test_case('auth: expired token is refreshed automatically', function() {
  $_SESSION = [];
  $config = new SketchfabConfig([
    'clientId' => 'client-123',
    'clientSecret' => 'secret-456',
    'redirectUri' => 'http://localhost/GAME-ENGINE3D/api/sketchfab_auth_callback.php',
  ]);
  $http = new FakeHttpClient();
  $auth = new SketchfabAuthService($config, $http);

  $_SESSION[SketchfabAuthService::SESSION_KEY] = [
    'access_token' => 'expired-token',
    'refresh_token' => 'refresh-token',
    'expires_at' => time() - 10,
    'user' => ['displayName' => 'Before'],
  ];

  $http->queueJson(200, [
    'access_token' => 'fresh-token',
    'refresh_token' => 'fresh-refresh',
    'expires_in' => 7200,
    'token_type' => 'Bearer',
  ]);
  $http->queueJson(200, [
    'uid' => 'user-2',
    'username' => 'newhunter',
    'displayName' => 'New Hunter',
    'profileUrl' => 'https://sketchfab.com/newhunter',
  ]);

  $token = $auth->getValidAccessToken();
  assert_same('fresh-token', $token);
});

test_case('auth: api token mode works without oauth client credentials', function() {
  $_SESSION = [];
  $config = new SketchfabConfig([
    'apiToken' => 'api-token-123',
  ]);
  $http = new FakeHttpClient();
  $auth = new SketchfabAuthService($config, $http);

  $token = $auth->getValidAccessToken();
  $status = $auth->getStatus();

  assert_same('api-token-123', $token);
  assert_same('Token api-token-123', $auth->getAuthorizationHeader());
  assert_true($status['configured'] === true, 'API token mode should count as configured');
  assert_true($status['authenticated'] === true, 'API token mode should be treated as authenticated');
  assert_same('api_token', $status['authMode']);
});
