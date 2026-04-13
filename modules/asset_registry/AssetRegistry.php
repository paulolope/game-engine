<?php
class AssetRegistry {
  private $registryPath;

  public function __construct($registryPath) {
    $this->registryPath = $registryPath;
    ensure_dir(dirname($registryPath));
  }

  public function all() {
    $data = read_json_file($this->registryPath, ['version' => 1, 'records' => []]);
    $records = $data['records'] ?? [];
    return is_array($records) ? $records : [];
  }

  public function findByModelUid($modelUid) {
    foreach ($this->all() as $record) {
      if (($record['sketchfabModelUid'] ?? '') === $modelUid) {
        return $record;
      }
    }
    return null;
  }

  public function isRecordUsable(array $record = null) {
    if (!$record) return false;
    $relativePath = $record['localFilePath'] ?? '';
    if ($relativePath === '') return false;
    return file_exists(project_root($relativePath));
  }

  public function upsert(array $record) {
    $data = read_json_file($this->registryPath, ['version' => 1, 'records' => []]);
    $records = is_array($data['records'] ?? null) ? $data['records'] : [];
    $updated = [];
    $found = false;

    foreach ($records as $existing) {
      if (($existing['sketchfabModelUid'] ?? '') === ($record['sketchfabModelUid'] ?? '')) {
        $updated[] = $record;
        $found = true;
      } else {
        $updated[] = $existing;
      }
    }

    if (!$found) $updated[] = $record;

    write_json_file($this->registryPath, ['version' => 1, 'records' => array_values($updated)]);
    return $record;
  }
}
