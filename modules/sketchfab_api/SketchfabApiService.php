<?php
class SketchfabApiService {
  private $config;
  private $httpClient;

  public function __construct(SketchfabConfig $config, SketchfabHttpClient $httpClient) {
    $this->config = $config;
    $this->httpClient = $httpClient;
  }

  public function searchModels(array $params = []) {
    $search = trim((string) ($params['q'] ?? ''));
    $directModelUid = $this->isDirectModelReference($search) ? $this->extractModelUid($search) : '';
    if ($directModelUid !== '') {
      return [
        'results' => [$this->getModel($directModelUid)],
        'next' => null,
        'previous' => null,
        'cursors' => ['next' => null, 'previous' => null],
      ];
    }

    $query = [
      'type' => 'models',
      'downloadable' => 'true',
      'count' => max(1, min(24, (int) ($params['count'] ?? $this->config->defaultCount))),
    ];

    $fileFormat = strtolower(trim((string) ($params['file_format'] ?? '')));
    if ($fileFormat !== '' && $fileFormat !== 'auto' && $fileFormat !== 'all') {
      $query['file_format'] = $fileFormat;
    }

    if ($search !== '') $query['q'] = $search;
    $cursor = trim((string) ($params['cursor'] ?? ''));
    if ($cursor !== '') $query['cursor'] = $cursor;
    $sortBy = trim((string) ($params['sort_by'] ?? ''));
    if ($sortBy !== '' && strtolower($sortBy) !== 'relevance') $query['sort_by'] = $sortBy;

    $response = $this->httpClient->requestJson('GET', $this->config->apiBaseUrl . '/search?' . http_build_query($query), [
      'headers' => ['Accept' => 'application/json'],
      'timeout' => 60,
    ]);

    if ($response['status'] < 200 || $response['status'] >= 300) {
      throw new SketchfabApiException('Falha ao buscar modelos no Sketchfab.', $response['status'], $response['data'], 'search');
    }

    $results = [];
    foreach (($response['data']['results'] ?? []) as $item) {
      $results[] = $this->normalizeModel($item);
    }

    return [
      'results' => $results,
      'next' => $response['data']['next'] ?? null,
      'previous' => $response['data']['previous'] ?? null,
      'cursors' => $response['data']['cursors'] ?? ['next' => null, 'previous' => null],
    ];
  }

  public function getModel($uid) {
    $uid = $this->extractModelUid($uid);
    if ($uid === '') {
      throw new SketchfabApiException('Model UID invalido.', 400, null, 'model');
    }

    $response = $this->httpClient->requestJson('GET', $this->config->apiBaseUrl . '/models/' . rawurlencode($uid), [
      'headers' => ['Accept' => 'application/json'],
      'timeout' => 60,
    ]);

    if ($response['status'] < 200 || $response['status'] >= 300) {
      throw new SketchfabApiException('Falha ao carregar detalhes do modelo Sketchfab.', $response['status'], $response['data'], 'model');
    }

    return $this->normalizeModel($response['data']);
  }

  public function requestModelDownload($uid, $authorizationHeader) {
    $uid = $this->extractModelUid($uid);
    if ($uid === '') {
      throw new SketchfabApiException('Model UID invalido.', 400, null, 'download_request');
    }

    $response = $this->httpClient->requestJson('GET', $this->config->apiBaseUrl . '/models/' . rawurlencode($uid) . '/download', [
      'headers' => ['Accept' => 'application/json', 'Authorization' => (string) $authorizationHeader],
      'timeout' => 90,
    ]);

    if ($response['status'] < 200 || $response['status'] >= 300) {
      $message = 'Falha ao solicitar download do modelo no Sketchfab.';
      if ($response['status'] === 401) $message = 'Credencial Sketchfab invalida ou expirada. Revise o SKETCHFAB_API_TOKEN ou faça login novamente.';
      if ($response['status'] === 403) $message = 'Este asset nao pode ser baixado com a conta Sketchfab atual.';
      if ($response['status'] === 404) $message = 'O modelo Sketchfab informado nao foi encontrado.';
      if ($response['status'] === 429) $message = 'O Sketchfab limitou temporariamente novas requisicoes. Tente novamente em instantes.';
      throw new SketchfabApiException($message, $response['status'], $response['data'], 'download_request');
    }

    return $response['data'];
  }

  public function extractModelUid($value) {
    $value = trim((string) $value);
    if ($value === '') return '';
    if (preg_match('/^[a-f0-9]{32}$/i', $value)) {
      return strtolower($value);
    }

    $patterns = [
      '~sketchfab\.com/(?:3d-models|models)/[^/?#]*-([a-f0-9]{32})(?:[/?#]|$)~i',
      '~sketchfab\.com/models/([a-f0-9]{32})(?:[/?#]|$)~i',
    ];
    foreach ($patterns as $pattern) {
      if (preg_match($pattern, $value, $match)) {
        return strtolower($match[1]);
      }
    }
    if (!preg_match('/[\s\/?#]/', $value)) {
      return $value;
    }
    return '';
  }

  public function isDirectModelReference($value) {
    $value = trim((string) $value);
    if ($value === '') return false;
    if (preg_match('/^[a-f0-9]{32}$/i', $value)) return true;
    return stripos($value, 'sketchfab.com/') !== false && $this->extractModelUid($value) !== '';
  }

  public function normalizeModel(array $model) {
    $user = is_array($model['user'] ?? null) ? $model['user'] : [];
    $license = is_array($model['license'] ?? null) ? $model['license'] : [];
    $images = (array) (($model['thumbnails']['images'] ?? []) ?: []);
    $archives = [];
    foreach ((array) ($model['archives'] ?? []) as $name => $archiveInfo) {
      if (is_array($archiveInfo) && !empty($archiveInfo['type'] ?? $name)) {
        $archives[$name] = $archiveInfo;
      }
    }

    $animationCount = max(
      0,
      (int) ($model['animationCount'] ?? 0),
      (int) ($model['animationsCount'] ?? 0)
    );
    $isAnimated = $animationCount > 0;
    if (!$isAnimated) {
      $animatedFlag = $model['isAnimated'] ?? ($model['animated'] ?? false);
      $isAnimated = filter_var($animatedFlag, FILTER_VALIDATE_BOOLEAN) || (is_numeric($animatedFlag) && (int) $animatedFlag > 0);
    }

    return [
      'modelUid' => $model['uid'] ?? '',
      'title' => $model['name'] ?? 'Sem nome',
      'description' => $model['description'] ?? '',
      'authorName' => $user['displayName'] ?? ($user['username'] ?? 'Autor desconhecido'),
      'authorUsername' => $user['username'] ?? '',
      'authorUrl' => $user['profileUrl'] ?? '',
      'licenseName' => $license['label'] ?? 'Licenca desconhecida',
      'licenseFullName' => $license['fullName'] ?? ($license['label'] ?? ''),
      'licenseUrl' => $license['url'] ?? '',
      'licenseSlug' => $license['slug'] ?? '',
      'sourceUrl' => $model['viewerUrl'] ?? ($model['uri'] ?? ''),
      'thumbnailUrl' => $this->pickThumbnailUrl($images),
      'thumbnailImages' => $images,
      'downloadable' => (bool) ($model['isDownloadable'] ?? false),
      'archives' => $archives,
      'formats' => array_values(array_keys($archives)),
      'faceCount' => (int) ($model['faceCount'] ?? 0),
      'vertexCount' => (int) ($model['vertexCount'] ?? 0),
      'isAnimated' => $isAnimated,
      'animationCount' => $animationCount,
      'publishedAt' => $model['publishedAt'] ?? null,
      'downloadCount' => (int) ($model['downloadCount'] ?? 0),
    ];
  }

  private function pickThumbnailUrl(array $images) {
    if (!$images) return '';
    usort($images, function($left, $right) {
      return ((int) ($left['width'] ?? 0)) <=> ((int) ($right['width'] ?? 0));
    });
    foreach ($images as $image) {
      if ((int) ($image['width'] ?? 0) >= 448) {
        return (string) ($image['url'] ?? '');
      }
    }
    $last = end($images);
    return (string) ($last['url'] ?? '');
  }
}
