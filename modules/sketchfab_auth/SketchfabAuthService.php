<?php
class SketchfabAuthService {
  const SESSION_KEY = 'sketchfab_oauth_token';
  const STATE_KEY = 'sketchfab_oauth_state';

  private $config;
  private $httpClient;

  public function __construct(SketchfabConfig $config, SketchfabHttpClient $httpClient) {
    $this->config = $config;
    $this->httpClient = $httpClient;
    session_bootstrap();
  }

  public function beginAuthorization() {
    $this->ensureOAuthConfigured();
    $state = bin2hex(random_bytes(24));
    $_SESSION[self::STATE_KEY] = $state;
    $query = http_build_query([
      'response_type' => 'code',
      'client_id' => $this->config->clientId,
      'redirect_uri' => $this->config->redirectUri,
      'state' => $state,
    ]);
    return rtrim($this->config->authorizeUrl, '/?') . '/?' . $query;
  }

  public function handleCallback($code, $state) {
    $this->ensureOAuthConfigured();
    $expectedState = $_SESSION[self::STATE_KEY] ?? '';
    unset($_SESSION[self::STATE_KEY]);

    if ($expectedState === '' || !hash_equals((string) $expectedState, (string) $state)) {
      throw new SketchfabApiException('Estado OAuth invalido. Refaça o login com Sketchfab.', 400, null, 'auth_callback');
    }
    if (!$code) {
      throw new SketchfabApiException('O Sketchfab nao retornou codigo de autorizacao.', 400, null, 'auth_callback');
    }

    $payload = $this->exchangeAuthorizationCode($code);
    $this->storeTokenPayload($payload);
    return $this->getStatus();
  }

  public function isAuthenticated() {
    try {
      return $this->getValidAccessToken() !== '';
    } catch (Throwable $error) {
      return false;
    }
  }

  public function getValidAccessToken() {
    if ($this->config->hasApiToken()) {
      return $this->config->apiToken;
    }

    $token = $this->getStoredTokenPayload();
    if (!is_array($token) || empty($token['access_token'])) {
      throw new SketchfabApiException('Voce precisa entrar com sua conta Sketchfab ou definir SKETCHFAB_API_TOKEN no .env para importar modelos.', 401, null, 'auth');
    }

    if ($this->isTokenExpired($token)) {
      if (!empty($token['refresh_token'])) {
        $refreshed = $this->refreshAccessToken($token['refresh_token']);
        if (empty($refreshed['refresh_token'])) {
          $refreshed['refresh_token'] = $token['refresh_token'];
        }
        $token = $this->storeTokenPayload($refreshed);
      } else {
        $this->logout();
        throw new SketchfabApiException('Token Sketchfab expirado. Faça login novamente.', 401, null, 'auth');
      }
    }

    return (string) $token['access_token'];
  }

  public function getAuthorizationHeader() {
    if ($this->config->hasApiToken()) {
      return 'Token ' . $this->config->apiToken;
    }

    $token = $this->getValidAccessToken();
    return 'Bearer ' . $token;
  }

  public function getStatus() {
    if ($this->config->hasApiToken()) {
      $user = $this->fetchCurrentUserByAuthorizationHeader($this->getAuthorizationHeader());
      return [
        'configured' => true,
        'authenticated' => true,
        'authMode' => 'api_token',
        'loginAvailable' => false,
        'redirectUri' => '',
        'user' => $user,
        'expiresAt' => null,
        'loginUrl' => null,
      ];
    }

    $token = $this->getStoredTokenPayload();
    $user = is_array($token) ? ($token['user'] ?? null) : null;
    $authenticated = false;
    $expiresAt = null;

    if (is_array($token) && !empty($token['access_token'])) {
      try {
        $this->getValidAccessToken();
        $fresh = $this->getStoredTokenPayload();
        $authenticated = true;
        $expiresAt = $fresh['expires_at'] ?? null;
        $user = $fresh['user'] ?? $user;
      } catch (Throwable $error) {
        $authenticated = false;
      }
    }

    return [
      'configured' => $this->config->isConfigured(),
      'authMode' => 'oauth',
      'authenticated' => $authenticated,
      'loginAvailable' => $this->config->hasOAuthCredentials(),
      'redirectUri' => $this->config->redirectUri,
      'user' => $user,
      'expiresAt' => $expiresAt,
      'loginUrl' => 'api/sketchfab_auth_start.php',
    ];
  }

  public function logout() {
    if ($this->config->hasApiToken()) {
      return;
    }
    unset($_SESSION[self::SESSION_KEY]);
  }

  private function ensureConfigured() {
    if (!$this->config->isConfigured()) {
      throw new SketchfabApiException('Sketchfab nao configurado. Defina SKETCHFAB_API_TOKEN no .env ou use SKETCHFAB_CLIENT_ID, SKETCHFAB_CLIENT_SECRET e SKETCHFAB_REDIRECT_URI.', 500, $this->config->publicConfig(), 'auth_config');
    }
  }

  private function ensureOAuthConfigured() {
    if ($this->config->hasApiToken()) {
      throw new SketchfabApiException('O Sketchfab ja esta configurado por API token no backend. O popup de login OAuth nao e necessario.', 400, $this->config->publicConfig(), 'auth_mode');
    }
    if (!$this->config->hasOAuthCredentials()) {
      throw new SketchfabApiException('Sketchfab OAuth nao configurado. Defina SKETCHFAB_CLIENT_ID, SKETCHFAB_CLIENT_SECRET e SKETCHFAB_REDIRECT_URI no .env.', 500, $this->config->publicConfig(), 'auth_config');
    }
  }

  private function exchangeAuthorizationCode($code) {
    $response = $this->httpClient->requestJson('POST', $this->config->tokenUrl, [
      'headers' => ['Accept' => 'application/json'],
      'contentType' => 'application/x-www-form-urlencoded',
      'body' => http_build_query([
        'grant_type' => 'authorization_code',
        'code' => $code,
        'client_id' => $this->config->clientId,
        'client_secret' => $this->config->clientSecret,
        'redirect_uri' => $this->config->redirectUri,
      ]),
      'timeout' => 60,
    ]);

    if ($response['status'] < 200 || $response['status'] >= 300) {
      throw new SketchfabApiException('Falha ao trocar o codigo OAuth por token.', $response['status'], $response['data'], 'auth_exchange');
    }
    return $response['data'];
  }

  private function refreshAccessToken($refreshToken) {
    $response = $this->httpClient->requestJson('POST', $this->config->tokenUrl, [
      'headers' => ['Accept' => 'application/json'],
      'contentType' => 'application/x-www-form-urlencoded',
      'body' => http_build_query([
        'grant_type' => 'refresh_token',
        'client_id' => $this->config->clientId,
        'client_secret' => $this->config->clientSecret,
        'refresh_token' => $refreshToken,
      ]),
      'timeout' => 60,
    ]);

    if ($response['status'] < 200 || $response['status'] >= 300) {
      $this->logout();
      throw new SketchfabApiException('Falha ao renovar o token Sketchfab. Faça login novamente.', $response['status'], $response['data'], 'auth_refresh');
    }
    return $response['data'];
  }

  private function fetchCurrentUser($accessToken) {
    return $this->fetchCurrentUserByAuthorizationHeader('Bearer ' . $accessToken);
  }

  private function fetchCurrentUserByAuthorizationHeader($authorizationHeader) {
    try {
      $response = $this->httpClient->requestJson('GET', $this->config->apiBaseUrl . '/me', [
        'headers' => ['Accept' => 'application/json', 'Authorization' => $authorizationHeader],
        'timeout' => 60,
      ]);
    } catch (Throwable $error) {
      return null;
    }

    if ($response['status'] < 200 || $response['status'] >= 300) {
      return null;
    }

    $user = $response['data'];
    return [
      'uid' => $user['uid'] ?? '',
      'username' => $user['username'] ?? '',
      'displayName' => $user['displayName'] ?? ($user['username'] ?? ''),
      'profileUrl' => $user['profileUrl'] ?? '',
    ];
  }

  private function storeTokenPayload(array $payload) {
    $accessToken = (string) ($payload['access_token'] ?? '');
    $expiresIn = max(0, (int) ($payload['expires_in'] ?? 0));
    $stored = [
      'access_token' => $accessToken,
      'refresh_token' => (string) ($payload['refresh_token'] ?? ''),
      'token_type' => (string) ($payload['token_type'] ?? 'Bearer'),
      'expires_in' => $expiresIn,
      'expires_at' => $expiresIn > 0 ? time() + $expiresIn : null,
      'scope' => $payload['scope'] ?? null,
      'stored_at' => time(),
      'user' => $accessToken !== '' ? $this->fetchCurrentUser($accessToken) : null,
    ];
    $_SESSION[self::SESSION_KEY] = $stored;
    return $stored;
  }

  private function getStoredTokenPayload() {
    return $_SESSION[self::SESSION_KEY] ?? null;
  }

  private function isTokenExpired(array $payload) {
    $expiresAt = isset($payload['expires_at']) ? (int) $payload['expires_at'] : 0;
    if ($expiresAt <= 0) return false;
    return $expiresAt <= (time() + 60);
  }
}
