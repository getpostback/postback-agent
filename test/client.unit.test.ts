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

  it('requests TikTok ad-level performance before an ad action', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        data: { ads: [] },
        meta: { requestId: 'request_tiktok_ads', apiVersion: '2026-08-09' },
      }),
    );
    const client = new PostbackClient({
      apiUrl: 'https://api.postback.sh',
      token: `pb_agent_${'a'.repeat(24)}_${'b'.repeat(43)}`,
      fetchImpl,
    });

    await client.tiktokAdPerformance('app_123', 30);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.postback.sh/v1/agent/apps/app_123/analytics/tiktok-ads?days=30',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('requests content performance with country and platform filters', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        data: { posts: [] },
        meta: { requestId: 'request_content', apiVersion: '2026-08-09' },
      }),
    );
    const client = new PostbackClient({
      apiUrl: 'https://api.postback.sh',
      token: `pb_agent_${'a'.repeat(24)}_${'b'.repeat(43)}`,
      fetchImpl,
    });

    await client.contentPerformance('app_123', {
      days: 14,
      country: 'FR',
      platform: 'tiktok',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.postback.sh/v1/agent/apps/app_123/analytics/content?days=14&country=FR&platform=tiktok',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('posts an idempotent action plan without placing the token in the URL or body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          created: true,
          plan: {
            id: 'agent_action_123',
            status: 'pending_approval',
            approvalUrl: 'https://postback.sh/approve',
          },
        },
        meta: { requestId: 'request_plan', apiVersion: '2026-08-09' },
      }),
    );
    const token = `pb_agent_${'a'.repeat(24)}_${'b'.repeat(43)}`;
    const client = new PostbackClient({
      apiUrl: 'https://api.postback.sh',
      token,
      fetchImpl,
    });
    const change = {
      actionKind: 'tiktok_ads.campaign_budget',
      campaignId: 'cmp_1',
      budget: 120,
      currency: 'USD',
      rationale: 'Revenue ROAS is above the approved scaling threshold.',
      idempotencyKey: 'budget-change-001',
    };

    await client.createActionPlan('app_123', change);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.postback.sh/v1/agent/apps/app_123/actions/plans',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(change);
    expect(url).not.toContain(token);
    expect(String(init.body)).not.toContain(token);
  });
});
