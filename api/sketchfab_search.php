<?php
require_once __DIR__ . '/sketchfab_bootstrap.php';

try {
  $services = sketchfab_services();
  $params = [
    'q' => $_GET['q'] ?? '',
    'cursor' => $_GET['cursor'] ?? '',
    'count' => $_GET['count'] ?? null,
    'file_format' => $_GET['file_format'] ?? '',
    'sort_by' => $_GET['sort_by'] ?? '',
  ];
  $search = $services['api']->searchModels($params);
  $results = [];
  foreach ($search['results'] as $item) {
    $record = $services['registry']->findByModelUid($item['modelUid']);
    $results[] = array_merge($item, [
      'cacheState' => $services['registry']->isRecordUsable($record) ? 'cached' : ($record ? 'missing' : 'new'),
      'localRecord' => $record,
    ]);
  }
  send_json(['ok' => true, 'results' => $results, 'next' => $search['next'], 'previous' => $search['previous'], 'cursors' => $search['cursors']]);
} catch (Throwable $error) {
  $data = sketchfab_error_response($error, 'search');
  send_json($data, $data['statusCode'] ?: 500);
}
