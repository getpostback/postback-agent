import { describe, expect, it, vi } from 'vitest';

import { PostbackApiError, PostbackClient } from '../src/client.js';

const TOKEN = `pb_agent_${'a'.repeat(24)}_${'b'.repeat(43)}`;

function envelope(data: unknown, requestId = 'request_123') {
  return Response.json({
    data,
    meta: { requestId, apiVersion: '2026-08-09' },
  });
}

describe('Postback client resilience', () => {
  it('retries a retryable response and honors a zero-second Retry-After', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json(
        { error: 'rate_limited', message: 'Try again' },
        { status: 429, headers: { 'retry-after': '0' } },
      ))
      .mockResolvedValueOnce(envelope({ apps: [] }, 'request_retry'));
    const client = new PostbackClient({
      apiUrl: 'https://api.postback.sh',
      token: TOKEN,
      fetchImpl,
    });

    await expect(client.listApps()).resolves.toMatchObject({
      meta: { requestId: 'request_retry' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed success envelope without retrying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ apps: [] }));
    const client = new PostbackClient({
      apiUrl: 'https://api.postback.sh',
      token: TOKEN,
      fetchImpl,
    });

    await expect(client.listApps()).rejects.toEqual(
      new PostbackApiError(
        'Postback returned an invalid response envelope',
        200,
        'invalid_response',
        null,
        null,
      ),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports a stable network error after exhausting retries', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn().mockRejectedValue(new TypeError('socket closed'));
      const client = new PostbackClient({
        apiUrl: 'https://api.postback.sh',
        token: TOKEN,
        fetchImpl,
      });
      const rejection = expect(client.listApps()).rejects.toMatchObject({
        code: 'network_error',
        message: 'Could not reach Postback',
        status: null,
      });

      await vi.runAllTimersAsync();
      await rejection;
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('encodes resource identifiers and event cursors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(envelope({ events: [] }));
    const client = new PostbackClient({
      apiUrl: 'https://api.postback.sh',
      token: TOKEN,
      fetchImpl,
    });

    await client.listEvents('app/with space', {
      limit: 25,
      before: '2026-08-09T10:30:00.000Z',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.postback.sh/v1/agent/apps/app%2Fwith%20space/events?limit=25&before=2026-08-09T10%3A30%3A00.000Z',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
