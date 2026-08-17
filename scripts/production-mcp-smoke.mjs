import assert from 'node:assert/strict';

const accessToken = process.env.POSTBACK_MCP_ACCESS_TOKEN?.trim();
assert.ok(
  accessToken,
  'Set POSTBACK_MCP_ACCESS_TOKEN to a production OAuth access token',
);

const protocolVersion = '2026-07-28';
const endpoint = 'https://api.postback.sh/mcp';
const expectedTools = [
  'list_apps',
  'diagnose_app',
  'get_analytics_overview',
  'get_funnel_performance',
  'get_tiktok_ad_performance',
  'list_social_accounts',
  'list_content',
  'get_content_performance',
  'get_integration_status',
  'list_recent_events',
  'explain_attribution',
  'propose_ad_change',
  'list_ad_changes',
  'get_ad_change',
  'execute_approved_ad_change',
];

let requestSequence = 0;

async function mcp(method, params = {}) {
  requestSequence += 1;
  const headers = {
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': protocolVersion,
    'Mcp-Method': method,
  };
  if (method === 'tools/call' && typeof params.name === 'string') {
    headers['Mcp-Name'] = params.name;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `production-smoke-${requestSequence}`,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': protocolVersion,
          'io.modelcontextprotocol/clientInfo': {
            name: 'postback-production-smoke',
            version: '1.0.0',
          },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null);
  assert.equal(
    response.status,
    200,
    `MCP ${method} failed with HTTP ${response.status}`,
  );
  assert.ok(payload && typeof payload === 'object', `MCP ${method} returned invalid JSON`);
  assert.equal(payload.error, undefined, `MCP ${method} returned a protocol error`);
  return payload.result;
}

const discover = await mcp('server/discover');
assert.ok(discover.capabilities?.tools);

const listed = await mcp('tools/list');
assert.deepEqual(listed.tools.map(({ name }) => name), expectedTools);

const apps = await mcp('tools/call', {
  name: 'list_apps',
  arguments: {},
});
assert.notEqual(apps.isError, true, 'list_apps returned an MCP tool error');
assert.ok(Array.isArray(apps.content), 'list_apps returned no MCP content');

process.stdout.write(
  `Authenticated MCP discovery, ${expectedTools.length} tools, and list_apps passed.\n`,
);
