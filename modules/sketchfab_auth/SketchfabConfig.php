<?php
class SketchfabConfig {
  public $apiToken;
  public $clientId;
  public $clientSecret;
  public $redirectUri;
  public $authorizeUrl;
  public $tokenUrl;
  public $apiBaseUrl;
  public $defaultCount;

  public function __construct(array $data = []) {
    $this->apiToken = trim((string) ($data['apiToken'] ?? ''));
    $this->clientId = trim((string) ($data['clientId'] ?? ''));
    $this->clientSecret = trim((string) ($data['clientSecret'] ?? ''));
    $this->redirectUri = trim((string) ($data['redirectUri'] ?? $this->detectRedirectUri()));
    $this->authorizeUrl = trim((string) ($data['authorizeUrl'] ?? 'https://sketchfab.com/oauth2/authorize/'));
    $this->tokenUrl = trim((string) ($data['tokenUrl'] ?? 'https://sketchfab.com/oauth2/token/'));
    $this->apiBaseUrl = rtrim((string) ($data['apiBaseUrl'] ?? 'https://api.sketchfab.com/v3'), '/');
    $count = (int) ($data['defaultCount'] ?? 12);
    $this->defaultCount = max(1, min(24, $count));
  }

  public static function fromEnv() {
    return new self([
      'apiToken' => env_value('SKETCHFAB_API_TOKEN', ''),
      'clientId' => env_value('SKETCHFAB_CLIENT_ID', ''),
      'clientSecret' => env_value('SKETCHFAB_CLIENT_SECRET', ''),
      'redirectUri' => env_value('SKETCHFAB_REDIRECT_URI', ''),
      'authorizeUrl' => env_value('SKETCHFAB_AUTHORIZE_URL', 'https://sketchfab.com/oauth2/authorize/'),
      'tokenUrl' => env_value('SKETCHFAB_TOKEN_URL', 'https://sketchfab.com/oauth2/token/'),
      'apiBaseUrl' => env_value('SKETCHFAB_API_BASE_URL', 'https://api.sketchfab.com/v3'),
      'defaultCount' => env_value('SKETCHFAB_SEARCH_COUNT', 12),
    ]);
  }

  public function isConfigured() {
    if ($this->hasApiToken()) return true;
    return $this->hasOAuthCredentials();
  }

  public function hasApiToken() {
    return $this->apiToken !== '';
  }

  public function hasOAuthCredentials() {
    return $this->clientId !== '' && $this->clientSecret !== '' && $this->redirectUri !== '';
  }

  public function getAuthMode() {
    if ($this->hasApiToken()) return 'api_token';
    if ($this->hasOAuthCredentials()) return 'oauth';
    return 'none';
  }

  public function publicConfig() {
    return [
      'configured' => $this->isConfigured(),
      'authMode' => $this->getAuthMode(),
      'redirectUri' => $this->redirectUri,
      'authorizeUrl' => $this->authorizeUrl,
      'apiBaseUrl' => $this->apiBaseUrl,
    ];
  }

  private function detectRedirectUri() {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $projectName = basename(project_root());
    return $scheme . '://' . $host . '/' . $projectName . '/api/sketchfab_auth_callback.php';
  }
}
