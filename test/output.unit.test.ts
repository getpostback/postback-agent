import { afterEach, describe, expect, it, vi } from 'vitest';

import { PostbackApiError } from '../src/client.js';
import { writeError, writeJson, writePretty } from '../src/output.js';

describe('CLI output', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes compact and pretty JSON with one trailing newline', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    writeJson({ ok: true });
    writePretty({ ok: true });

    expect(write).toHaveBeenNthCalledWith(1, '{"ok":true}\n');
    expect(write).toHaveBeenNthCalledWith(2, '{\n  "ok": true\n}\n');
  });

  it('preserves structured API error fields in JSON mode', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    writeError(
      new PostbackApiError('Missing scope', 403, 'forbidden', 'request_403', {
        requiredScope: 'apps:read',
      }),
      true,
    );

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual({
      error: {
        code: 'forbidden',
        details: { requiredScope: 'apps:read' },
        message: 'Missing scope',
        requestId: 'request_403',
        status: 403,
      },
    });
  });

  it('writes readable errors and request IDs in human mode', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    writeError(new PostbackApiError('Rejected', 400, 'invalid', 'request_1'), false);
    writeError('unexpected failure', false);

    expect(write.mock.calls.map(([value]) => String(value))).toEqual([
      'Error: Rejected\n',
      'Request ID: request_1\n',
      'Error: unexpected failure\n',
    ]);
  });
});
