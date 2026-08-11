import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createProgram } from '../src/index.js';
import { CLI_VERSION } from '../src/version.js';

const TOKEN = `pb_agent_${'a'.repeat(24)}_${'b'.repeat(43)}`;

type CapturedRequest = {
  authorization: string | undefined;
  body: string;
  method: string | undefined;
  url: string | undefined;
  userAgent: string | undefined;
};

type ActionCase = {
  args: string[];
  expected: Record<string, unknown>;
};

describe('CLI command integration', () => {
  let output: string[];
  let requests: CapturedRequest[];
  let stopServer: () => Promise<void>;

  beforeEach(async () => {
    output = [];
    requests = [];
    const server = createServer(async (
      request: IncomingMessage,
      response: ServerResponse,
    ) => {
      let body = '';
      for await (const chunk of request) body += String(chunk);
      requests.push({
        authorization: request.headers.authorization,
        body,
        method: request.method,
        url: request.url,
        userAgent: request.headers['user-agent'],
      });
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        data: request.method === 'POST'
          ? { created: true, plan: { id: 'plan_123' } }
          : { apps: [{ id: 'app_123', name: 'Demo' }] },
        meta: { requestId: 'request_local', apiVersion: '2026-08-09' },
      }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address() as AddressInfo;
    vi.stubEnv('POSTBACK_API_URL', `http://127.0.0.1:${address.port}`);
    vi.stubEnv('POSTBACK_TOKEN', TOKEN);
    vi.stubEnv(
      'POSTBACK_CONFIG_DIR',
      await mkdtemp(join(tmpdir(), 'postback-cli-integration-')),
    );
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    stopServer = () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  afterEach(async () => {
    await stopServer();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  async function runCommand(args: string[]): Promise<void> {
    await createProgram().parseAsync(['node', 'postback', ...args]);
  }

  it('runs a read command and emits the stable JSON envelope', async () => {
    await runCommand(['apps']);

    expect(JSON.parse(output.join(''))).toMatchObject({
      data: { apps: [{ id: 'app_123' }] },
      meta: { requestId: 'request_local' },
    });
    expect(requests).toEqual([
      expect.objectContaining({
        authorization: `Bearer ${TOKEN}`,
        body: '',
        method: 'GET',
        url: '/v1/agent/apps',
        userAgent: `postback-cli/${CLI_VERSION}`,
      }),
    ]);
  });

  it.each([
    { args: ['diagnose', 'app_123', '--hours', '48'], path: '/v1/agent/apps/app_123/diagnose?hours=48' },
    { args: ['analytics', 'overview', 'app_123', '--days', '14'], path: '/v1/agent/apps/app_123/analytics/overview?days=14' },
    { args: ['analytics', 'funnels', 'app_123', '--days', '14'], path: '/v1/agent/apps/app_123/analytics/funnels?days=14' },
    { args: ['analytics', 'tiktok-ads', 'app_123', '--days', '14'], path: '/v1/agent/apps/app_123/analytics/tiktok-ads?days=14' },
    { args: ['integrations', 'status', 'app_123'], path: '/v1/agent/apps/app_123/integrations' },
    { args: ['events', 'list', 'app_123', '--limit', '25', '--before', '2026-08-09T10:30:00.000Z'], path: '/v1/agent/apps/app_123/events?limit=25&before=2026-08-09T10%3A30%3A00.000Z' },
    { args: ['installs', 'explain', 'postback/123'], path: '/v1/agent/installs/postback%2F123' },
    { args: ['actions', 'list', 'app_123', '--limit', '10'], path: '/v1/agent/apps/app_123/actions/plans?limit=10' },
    { args: ['actions', 'get', 'app_123', 'plan/123'], path: '/v1/agent/apps/app_123/actions/plans/plan%2F123' },
  ])('routes $args to $path', async ({ args, path }) => {
    await runCommand(args);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'GET', url: path });
  });

  it('covers authentication status, login, logout, and human output', async () => {
    await runCommand(['--human', 'auth', 'status']);
    expect(output.join('')).toBe('Authenticated with a valid scoped agent token.\n');

    output = [];
    requests = [];
    await runCommand(['auth', 'login']);
    expect(requests[0]).toMatchObject({ method: 'GET', url: '/v1/agent/me' });

    output = [];
    requests = [];
    await runCommand(['--pretty', 'auth', 'logout']);
    expect(requests).toHaveLength(0);
    expect(JSON.parse(output.join(''))).toMatchObject({
      data: { environmentTokenActive: true, removed: false },
    });
  });

  it('translates every approval-gated proposal into the backend action contract', async () => {
    const cases: ActionCase[] = [
      {
        args: ['apple-campaign-status', '--org-id', '10', '--campaign-id', '20', '--status', 'PAUSED'],
        expected: { actionKind: 'apple_ads.campaign_status', orgId: '10', campaignId: '20', status: 'PAUSED' },
      },
      {
        args: ['apple-campaign-budget', '--org-id', '10', '--campaign-id', '20', '--amount', '125.50', '--currency', 'usd'],
        expected: { actionKind: 'apple_ads.campaign_daily_budget', orgId: '10', campaignId: '20', dailyBudgetAmount: 125.5, currency: 'USD' },
      },
      {
        args: ['apple-keyword-status', '--org-id', '10', '--campaign-id', '20', '--ad-group-id', '30', '--keyword-id', '40', '--status', 'ACTIVE'],
        expected: { actionKind: 'apple_ads.keyword_status', orgId: '10', campaignId: '20', adGroupId: '30', keywordId: '40', status: 'ACTIVE' },
      },
      {
        args: ['apple-keyword-bid', '--org-id', '10', '--campaign-id', '20', '--ad-group-id', '30', '--keyword-id', '40', '--amount', '2.75', '--currency', 'eur'],
        expected: { actionKind: 'apple_ads.keyword_bid', orgId: '10', campaignId: '20', adGroupId: '30', keywordId: '40', bidAmount: 2.75, currency: 'EUR' },
      },
      {
        args: ['tiktok-campaign-status', '--campaign-id', '50', '--status', 'DISABLE'],
        expected: { actionKind: 'tiktok_ads.campaign_status', campaignId: '50', status: 'DISABLE' },
      },
      {
        args: ['tiktok-campaign-budget', '--campaign-id', '50', '--amount', '400', '--currency', 'usd'],
        expected: { actionKind: 'tiktok_ads.campaign_budget', campaignId: '50', budget: 400, currency: 'USD' },
      },
      {
        args: ['tiktok-adgroup-status', '--ad-group-id', '60', '--status', 'ENABLE'],
        expected: { actionKind: 'tiktok_ads.adgroup_status', adGroupId: '60', status: 'ENABLE' },
      },
      {
        args: ['tiktok-adgroup-budget', '--ad-group-id', '60', '--amount', '250', '--currency', 'gbp'],
        expected: { actionKind: 'tiktok_ads.adgroup_budget', adGroupId: '60', budget: 250, currency: 'GBP' },
      },
      {
        args: ['tiktok-ad-status', '--ad-id', '70', '--status', 'DISABLE'],
        expected: { actionKind: 'tiktok_ads.ad_status', adId: '70', status: 'DISABLE' },
      },
    ];

    for (const [index, actionCase] of cases.entries()) {
      const idempotencyKey = `release:test:${index}`;
      requests = [];
      await runCommand([
        'actions',
        'propose',
        ...actionCase.args.slice(0, 1),
        'app_123',
        ...actionCase.args.slice(1),
        '--reason',
        'Release contract verification.',
        '--idempotency-key',
        idempotencyKey,
      ]);

      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        method: 'POST',
        url: '/v1/agent/apps/app_123/actions/plans',
      });
      expect(JSON.parse(requests[0]?.body ?? '')).toEqual({
        ...actionCase.expected,
        idempotencyKey,
        rationale: 'Release contract verification.',
      });
    }
  });

  it('generates an idempotency key and executes only an approved plan endpoint', async () => {
    await runCommand([
      'actions', 'propose', 'tiktok-ad-status', 'app_123',
      '--ad-id', '70', '--status', 'DISABLE', '--reason', 'Generated key check.',
    ]);
    expect(JSON.parse(requests[0]?.body ?? '')).toMatchObject({
      idempotencyKey: expect.stringMatching(/^cli:[0-9a-f-]{36}$/),
    });

    requests = [];
    await runCommand(['actions', 'execute', 'app_123', 'plan/123']);
    expect(requests[0]).toMatchObject({
      body: '{}',
      method: 'POST',
      url: '/v1/agent/apps/app_123/actions/plans/plan%2F123/execute',
    });
  });
});
