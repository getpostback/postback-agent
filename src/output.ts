import { PostbackApiError } from './client.js';

export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function writePretty(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function writeError(error: unknown, json: boolean): void {
  const normalized = normalizeError(error);
  if (json) {
    process.stderr.write(`${JSON.stringify({ error: normalized })}\n`);
    return;
  }

  process.stderr.write(`Error: ${normalized.message}\n`);
  if (normalized.requestId) {
    process.stderr.write(`Request ID: ${normalized.requestId}\n`);
  }
}

function normalizeError(error: unknown) {
  if (error instanceof PostbackApiError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      requestId: error.requestId,
      details: error.details,
    };
  }
  return {
    code: 'cli_error',
    message: error instanceof Error ? error.message : String(error),
    status: null,
    requestId: null,
    details: null,
  };
}
