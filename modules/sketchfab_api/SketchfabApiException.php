<?php
class SketchfabApiException extends RuntimeException {
  private $statusCode;
  private $responseData;
  private $stage;

  public function __construct($message, $statusCode = 0, $responseData = null, $stage = 'request', Throwable $previous = null) {
    parent::__construct($message, (int) $statusCode, $previous);
    $this->statusCode = (int) $statusCode;
    $this->responseData = $responseData;
    $this->stage = (string) $stage;
  }

  public function getStatusCode() {
    return $this->statusCode;
  }

  public function getResponseData() {
    return $this->responseData;
  }

  public function getStage() {
    return $this->stage;
  }

  public function toArray() {
    return [
      'message' => $this->getMessage(),
      'statusCode' => $this->statusCode,
      'stage' => $this->stage,
      'response' => $this->responseData,
    ];
  }
}
