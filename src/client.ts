export type AgentEnvelope<T = unknown> = {
  data: T;
  meta: {
    requestId: string | null;
    apiVersion: string;
  };
};

export class PostbackApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string,
    readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = 'PostbackApiError';
  }
}

export class PostbackClient {
  constructor(
    private readonly options: {
      apiUrl: string;
      token: string;
      timeoutMs?: number;
      fetchImpl?: typeof fetch;
    },
  ) {}

  me() {
    return this.get('/v1/agent/me');
  }

  listApps() {
    return this.get('/v1/agent/apps');
  }

  diagnoseApp(appId: string, hours: number) {
    return this.get(
      `/v1/agent/apps/${encodeURIComponent(appId)}/diagnose?hours=${hours}`,
    );
  }

  analyticsOverview(appId: string, days: number) {
    return this.get(
      `/v1/agent/apps/${encodeURIComponent(appId)}/analytics/overview?days=${days}`,
    );
  }

  funnelPerformance(appId: string, days: number) {
    return this.get(
      `/v1/agent/apps/${encodeURIComponent(appId)}/analytics/funnels?days=${days}`,
    );
  }

  integrationStatus(appId: string) {
    return this.get(
      `/v1/agent/apps/${encodeURIComponent(appId)}/integrations`,
    );
  }

  listEvents(appId: string, options: { limit: number; before?: string }) {
    const query = new URLSearchParams({ limit: String(options.limit) });
    if (options.before) query.set('before', options.before);
    return this.get(
      `/v1/agent/apps/${encodeURIComponent(appId)}/events?${query.toString()}`,
    );
  }

  explainInstall(postbackId: string) {
    return this.get(`/v1/agent/installs/${encodeURIComponent(postbackId)}`);
  }

  private async get(path: string): Promise<AgentEnvelope> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const retryStatuses = new Set([429, 502, 503, 504]);
    let lastError: unknown;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetchImpl(`${this.options.apiUrl}${path}`, {
          method: 'GET',
          redirect: 'error',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${this.options.token}`,
            'User-Agent': 'postback-cli/0.1.0',
          },
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
        });
        const payload = await readJson(response);
        const requestId =
          response.headers.get('x-request-id')
          ?? stringValue(payload, 'meta', 'requestId');

        if (response.ok) {
          if (!isAgentEnvelope(payload)) {
            throw new PostbackApiError(
              'Postback returned an invalid response envelope',
              response.status,
              'invalid_response',
              requestId,
            );
          }
          return payload;
        }

        const error = new PostbackApiError(
          stringValue(payload, 'message') ?? `Postback request failed (${response.status})`,
          response.status,
          stringValue(payload, 'error') ?? 'request_failed',
          requestId,
        );
        if (!retryStatuses.has(response.status) || attempt === 2) throw error;
        lastError = error;
        await delay(retryDelay(response, attempt));
      } catch (error) {
        if (error instanceof PostbackApiError) throw error;
        lastError = error;
        if (attempt === 2) break;
        await delay(200 * (attempt + 1));
      }
    }

    const timedOut =
      lastError instanceof Error
      && (lastError.name === 'TimeoutError' || lastError.name === 'AbortError');
    throw new PostbackApiError(
      timedOut ? 'Postback request timed out' : 'Could not reach Postback',
      null,
      timedOut ? 'timeout' : 'network_error',
    );
  }
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isAgentEnvelope(value: unknown): value is AgentEnvelope {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return 'data' in record && Boolean(record.meta) && typeof record.meta === 'object';
}

function stringValue(value: unknown, ...path: string[]): string | null {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : null;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    return Math.min(Number(retryAfter) * 1000, 2_000);
  }
  return 250 * (attempt + 1);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
