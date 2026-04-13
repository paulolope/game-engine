<?php
class SketchfabHttpClient {
  public function request($method, $url, array $options = []) {
    $method = strtoupper((string) $method);
    $timeout = (int) ($options['timeout'] ?? 60);
    $headers = $this->normalizeHeaders($options['headers'] ?? []);
    $body = array_key_exists('body', $options) ? $options['body'] : null;
    $contentType = isset($options['contentType']) ? (string) $options['contentType'] : '';

    if (function_exists('curl_init')) {
      return $this->requestWithCurlExtension($method, $url, $headers, $body, $contentType, $timeout);
    }
    if ($this->hasCurlCli()) {
      return $this->requestWithCurlCli($method, $url, $headers, $body, $contentType, $timeout);
    }
    if ($this->canUseStreamWrapper($url)) {
      return $this->requestWithStreams($method, $url, $headers, $body, $contentType, $timeout);
    }
    throw new SketchfabApiException('Nenhum cliente HTTP disponivel no PHP atual para acessar o Sketchfab.', 500, null, 'http_client');
  }

  public function requestJson($method, $url, array $options = []) {
    $response = $this->request($method, $url, $options);
    $payload = trim((string) $response['body']);
    if ($payload === '') {
      return ['status' => $response['status'], 'headers' => $response['headers'], 'data' => []];
    }
    $decoded = json_decode($payload, true);
    if (!is_array($decoded)) {
      throw new SketchfabApiException('Resposta JSON invalida recebida do Sketchfab.', $response['status'], $payload, 'decode_json');
    }
    return ['status' => $response['status'], 'headers' => $response['headers'], 'data' => $decoded];
  }

  public function downloadFile($url, $targetPath, array $options = []) {
    ensure_dir(dirname($targetPath));
    $timeout = (int) ($options['timeout'] ?? 120);
    $headers = $this->normalizeHeaders($options['headers'] ?? []);

    if (function_exists('curl_init')) {
      return $this->downloadWithCurlExtension($url, $targetPath, $headers, $timeout);
    }
    if ($this->hasCurlCli()) {
      return $this->downloadWithCurlCli($url, $targetPath, $headers, $timeout);
    }
    if ($this->canUseStreamWrapper($url)) {
      return $this->downloadWithStreams($url, $targetPath, $headers, $timeout);
    }
    throw new SketchfabApiException('Nenhum cliente HTTP disponivel para baixar arquivos do Sketchfab.', 500, null, 'download');
  }

  private function requestWithCurlExtension($method, $url, array $headers, $body, $contentType, $timeout) {
    $ch = curl_init($url);
    if ($ch === false) {
      throw new SketchfabApiException('Falha ao inicializar cURL.', 500, null, 'http_client');
    }

    $responseHeaders = [];
    curl_setopt_array($ch, [
      CURLOPT_CUSTOMREQUEST => $method,
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_TIMEOUT => $timeout,
      CURLOPT_HTTPHEADER => $this->flattenHeaders($headers, $contentType),
      CURLOPT_HEADERFUNCTION => function($curl, $headerLine) use (&$responseHeaders) {
        $length = strlen($headerLine);
        $trimmed = trim($headerLine);
        if ($trimmed === '' || stripos($trimmed, 'HTTP/') === 0) {
          return $length;
        }
        $parts = explode(':', $trimmed, 2);
        if (count($parts) === 2) {
          $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
        }
        return $length;
      },
    ]);

    if ($body !== null && $method !== 'GET') {
      curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    $raw = curl_exec($ch);
    if ($raw === false) {
      $message = curl_error($ch) ?: 'Falha desconhecida de rede.';
      curl_close($ch);
      throw new SketchfabApiException($message, 500, null, 'http_client');
    }

    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return ['status' => $status, 'headers' => $responseHeaders, 'body' => (string) $raw];
  }

  private function downloadWithCurlExtension($url, $targetPath, array $headers, $timeout) {
    $fileHandle = fopen($targetPath, 'wb');
    if ($fileHandle === false) {
      throw new SketchfabApiException('Nao foi possivel criar o arquivo de download local.', 500, null, 'download');
    }

    $responseHeaders = [];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_TIMEOUT => $timeout,
      CURLOPT_FILE => $fileHandle,
      CURLOPT_HTTPHEADER => $this->flattenHeaders($headers, ''),
      CURLOPT_HEADERFUNCTION => function($curl, $headerLine) use (&$responseHeaders) {
        $length = strlen($headerLine);
        $trimmed = trim($headerLine);
        if ($trimmed === '' || stripos($trimmed, 'HTTP/') === 0) {
          return $length;
        }
        $parts = explode(':', $trimmed, 2);
        if (count($parts) === 2) {
          $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
        }
        return $length;
      },
    ]);

    $ok = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    fclose($fileHandle);

    if ($ok === false || $status < 200 || $status >= 300) {
      @unlink($targetPath);
      throw new SketchfabApiException($error ?: 'Falha ao baixar o arquivo do Sketchfab.', $status ?: 500, null, 'download');
    }

    return ['status' => $status, 'headers' => $responseHeaders, 'path' => $targetPath];
  }

  private function requestWithCurlCli($method, $url, array $headers, $body, $contentType, $timeout) {
    $headerFile = tempnam(cache_root('tmp'), 'skfb_hdr_');
    $bodyFile = tempnam(cache_root('tmp'), 'skfb_body_');
    $dataFile = null;

    try {
      $command = [$this->detectCurlCliPath(), '-sS', '-L', '-X', $method, '--max-time', (string) $timeout, '-D', $headerFile, '-o', $bodyFile, '--write-out', '%{http_code}'];
      foreach ($this->flattenHeaders($headers, $contentType) as $headerLine) {
        $command[] = '-H';
        $command[] = $headerLine;
      }
      if ($body !== null && $method !== 'GET') {
        $dataFile = tempnam(cache_root('tmp'), 'skfb_req_');
        file_put_contents($dataFile, (string) $body);
        $command[] = '--data-binary';
        $command[] = '@' . $dataFile;
      }
      $command[] = $url;
      $result = $this->runProcess($command);
      $status = (int) trim((string) $result['stdout']);
      $headersOut = $this->parseResponseHeaders($headerFile);
      $bodyOut = is_file($bodyFile) ? file_get_contents($bodyFile) : '';
      return ['status' => $status, 'headers' => $headersOut, 'body' => (string) $bodyOut];
    } finally {
      $this->cleanupTempFile($headerFile);
      $this->cleanupTempFile($bodyFile);
      $this->cleanupTempFile($dataFile);
    }
  }

  private function downloadWithCurlCli($url, $targetPath, array $headers, $timeout) {
    $headerFile = tempnam(cache_root('tmp'), 'skfb_hdr_');
    try {
      $command = [$this->detectCurlCliPath(), '-sS', '-L', '--max-time', (string) $timeout, '-D', $headerFile, '-o', $targetPath, '--write-out', '%{http_code}'];
      foreach ($this->flattenHeaders($headers, '') as $headerLine) {
        $command[] = '-H';
        $command[] = $headerLine;
      }
      $command[] = $url;
      $result = $this->runProcess($command);
      $status = (int) trim((string) $result['stdout']);
      if ($status < 200 || $status >= 300) {
        @unlink($targetPath);
        throw new SketchfabApiException($result['stderr'] ?: 'Falha ao baixar o arquivo do Sketchfab.', $status ?: 500, null, 'download');
      }
      return ['status' => $status, 'headers' => $this->parseResponseHeaders($headerFile), 'path' => $targetPath];
    } finally {
      $this->cleanupTempFile($headerFile);
    }
  }

  private function requestWithStreams($method, $url, array $headers, $body, $contentType, $timeout) {
    $context = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $this->flattenHeaders($headers, $contentType)), 'content' => $body, 'ignore_errors' => true, 'timeout' => $timeout]]);
    $raw = @file_get_contents($url, false, $context);
    return ['status' => $this->extractStatusCode($http_response_header ?? []), 'headers' => $this->headersFromStream($http_response_header ?? []), 'body' => (string) $raw];
  }

  private function downloadWithStreams($url, $targetPath, array $headers, $timeout) {
    $response = $this->requestWithStreams('GET', $url, $headers, null, '', $timeout);
    if ($response['status'] < 200 || $response['status'] >= 300) {
      throw new SketchfabApiException('Falha ao baixar o arquivo do Sketchfab.', $response['status'] ?: 500, $response['body'], 'download');
    }
    file_put_contents($targetPath, $response['body']);
    return ['status' => $response['status'], 'headers' => $response['headers'], 'path' => $targetPath];
  }

  private function hasCurlCli() {
    return $this->detectCurlCliPath() !== '';
  }

  private function detectCurlCliPath() {
    static $path = null;
    if ($path !== null) return $path;
    foreach (['curl.exe', 'curl'] as $candidate) {
      $check = @shell_exec($candidate . ' --version 2>NUL');
      if (is_string($check) && stripos($check, 'curl ') === 0) {
        $path = $candidate;
        return $path;
      }
    }
    $path = '';
    return $path;
  }

  private function canUseStreamWrapper($url) {
    $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
    if ($scheme === 'https' && !in_array('https', stream_get_wrappers(), true)) return false;
    if ($scheme === 'http' && !in_array('http', stream_get_wrappers(), true)) return false;
    return true;
  }

  private function normalizeHeaders(array $headers) {
    $normalized = [];
    foreach ($headers as $name => $value) {
      if ($value === null || $value === '') continue;
      $normalized[(string) $name] = (string) $value;
    }
    return $normalized;
  }

  private function flattenHeaders(array $headers, $contentType) {
    $flattened = [];
    if ($contentType !== '' && !isset($headers['Content-Type']) && !isset($headers['content-type'])) {
      $headers['Content-Type'] = $contentType;
    }
    foreach ($headers as $name => $value) {
      $flattened[] = $name . ': ' . $value;
    }
    return $flattened;
  }

  private function runProcess(array $command) {
    $escaped = array_map('escapeshellarg', $command);
    $process = proc_open(implode(' ', $escaped), [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, project_root());
    if (!is_resource($process)) {
      throw new SketchfabApiException('Falha ao iniciar processo HTTP auxiliar.', 500, null, 'http_client');
    }
    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);
    if ($exitCode !== 0) {
      throw new SketchfabApiException(trim((string) $stderr) ?: 'Falha ao executar cliente HTTP.', 500, null, 'http_client');
    }
    return ['stdout' => (string) $stdout, 'stderr' => (string) $stderr];
  }

  private function parseResponseHeaders($path) {
    if (!is_file($path)) return [];
    $content = trim((string) file_get_contents($path));
    if ($content === '') return [];
    $blocks = preg_split("/\r?\n\r?\n/", $content);
    $lastBlock = (string) end($blocks);
    $headers = [];
    foreach (preg_split("/\r?\n/", $lastBlock) as $line) {
      if (stripos($line, 'HTTP/') === 0 || trim($line) === '') continue;
      $parts = explode(':', $line, 2);
      if (count($parts) === 2) {
        $headers[strtolower(trim($parts[0]))] = trim($parts[1]);
      }
    }
    return $headers;
  }

  private function extractStatusCode(array $headers) {
    foreach ($headers as $line) {
      if (preg_match('#HTTP/\S+\s+(\d{3})#', $line, $matches)) return (int) $matches[1];
    }
    return 0;
  }

  private function headersFromStream(array $headers) {
    $parsed = [];
    foreach ($headers as $line) {
      if (stripos($line, 'HTTP/') === 0 || trim($line) === '') continue;
      $parts = explode(':', $line, 2);
      if (count($parts) === 2) {
        $parsed[strtolower(trim($parts[0]))] = trim($parts[1]);
      }
    }
    return $parsed;
  }

  private function cleanupTempFile($path) {
    if ($path && is_file($path)) @unlink($path);
  }
}
