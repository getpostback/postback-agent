import assert from 'node:assert/strict';

const apiOrigin = 'https://api.postback.sh';
const siteOrigin = 'https://postback.sh';
const mcpResource = `${apiOrigin}/mcp`;
const resourceMetadataUrl =
  `${apiOrigin}/.well-known/oauth-protected-resource/mcp`;
const authorizationMetadataUrl =
  `${apiOrigin}/.well-known/oauth-authorization-server`;

async function request(url, init = {}) {
  return fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
}

async function json(response) {
  assert.match(
    response.headers.get('content-type') ?? '',
    /^application\/json\b/i,
  );
  return response.json();
}

const healthResponse = await request(`${apiOrigin}/health`);
assert.equal(healthResponse.status, 200);
assert.deepEqual(
  await json(healthResponse).then(({ status, service }) => ({ status, service })),
  { status: 'ok', service: 'postback-edge' },
);

const resourceResponse = await request(resourceMetadataUrl);
assert.equal(resourceResponse.status, 200);
assert.match(resourceResponse.headers.get('cache-control') ?? '', /max-age=300/);
const resource = await json(resourceResponse);
assert.equal(resource.resource, mcpResource);
assert.deepEqual(resource.authorization_servers, [apiOrigin]);
assert.deepEqual(resource.bearer_methods_supported, ['header']);
for (const scope of [
  'apps:read',
  'analytics:read',
  'attribution:read',
  'events:read',
  'integrations:read',
]) {
  assert.ok(resource.scopes_supported.includes(scope));
}

const authorizationResponse = await request(authorizationMetadataUrl);
assert.equal(authorizationResponse.status, 200);
const authorization = await json(authorizationResponse);
assert.equal(authorization.issuer, apiOrigin);
assert.equal(authorization.authorization_endpoint, `${siteOrigin}/oauth/authorize`);
assert.equal(authorization.token_endpoint, `${apiOrigin}/oauth/token`);
assert.equal(authorization.registration_endpoint, `${apiOrigin}/oauth/register`);
assert.equal(authorization.revocation_endpoint, `${apiOrigin}/oauth/revoke`);
assert.deepEqual(authorization.code_challenge_methods_supported, ['S256']);
assert.ok(authorization.grant_types_supported.includes('refresh_token'));

const unauthorizedResponse = await request(mcpResource, {
  method: 'POST',
  headers: {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': '2026-07-28',
    'Mcp-Method': 'tools/list',
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 'public-smoke',
    method: 'tools/list',
    params: {},
  }),
});
assert.equal(unauthorizedResponse.status, 401);
assert.ok(
  (unauthorizedResponse.headers.get('www-authenticate') ?? '')
    .includes(`resource_metadata="${resourceMetadataUrl}"`),
);
assert.match(
  unauthorizedResponse.headers.get('cache-control') ?? '',
  /private, no-store/,
);
assert.equal((await json(unauthorizedResponse)).error, 'unauthorized');

const invalidOriginResponse = await request(mcpResource, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: 'https://attacker.example',
  },
  body: '{}',
});
assert.equal(invalidOriginResponse.status, 403);
assert.equal((await json(invalidOriginResponse)).error, 'invalid_origin');

for (const [path, marker] of [
  ['/docs/mcp', 'Postback MCP'],
  ['/docs/cli', 'Postback CLI'],
]) {
  const response = await request(`${siteOrigin}${path}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html\b/i);
  assert.match(await response.text(), new RegExp(marker));
}

process.stdout.write(
  'Production health, OAuth discovery, MCP challenge/origin policy, and public docs passed.\n',
);
