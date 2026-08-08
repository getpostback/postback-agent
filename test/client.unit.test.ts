import { describe, expect, it, vi } from 'vitest';

import { PostbackApiError, PostbackClient } from '../src/client.js';

describe('Postback client', () => {
  it('sends a bearer token and accepts the stable envelope', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        data: { apps: [] },
        meta: { requestId: 'request_123', apiVersion: '2026-08-08' },
      }),
    );
    const client = new PostbackClient({
      apiUrl: 'https://api.postback.sh',
      token: `pb_agent_${'a'.repeat(24)}_${'b'.repeat(43)}`,
      fetchImpl,
    });

    await expect(client.listApps()).resolves.toMatchObject({ data: { apps: [] } });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.postback.sh/v1/agent/apps',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Bearer /) }),
      }),
    );
  });

  it('returns stable API errors without leaking the token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json(
        { error: 'forbidden', message: 'Missing scope' },
        { status: 403, headers: { 'x-request-id': 'request_403' } },
      ),
    );
    const client = new PostbackClient({
      apiUrl: 'https://api.postback.sh',
      token: `pb_agent_${'a'.repeat(24)}_${'b'.repeat(43)}`,
      fetchImpl,
    });

    await expect(client.listApps()).rejects.toEqual(
      new PostbackApiError('Missing scope', 403, 'forbidden', 'request_403'),
    );
  });

  it('requests funnel performance from the analytics API', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        data: { summaries: [] },
        meta: { requestId: 'request_funnels', apiVersion: '2026-08-08' },
      }),
    );
    const client = new PostbackClient({
      apiUrl: 'https://api.postback.sh',
      token: `pb_agent_${'a'.repeat(24)}_${'b'.repeat(43)}`,
      fetchImpl,
    });

    await client.funnelPerformance('app_123', 30);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.postback.sh/v1/agent/apps/app_123/analytics/funnels?days=30',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
