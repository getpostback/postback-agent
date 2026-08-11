import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const apiOrigin = 'https://api.postback.sh';
const authorizationEndpoint = 'https://postback.sh/oauth/authorize';
const resource = `${apiOrigin}/mcp`;
const scopes = [
  'apps:read',
  'analytics:read',
  'attribution:read',
  'events:read',
  'integrations:read',
];
const verifier = randomBytes(64).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(32).toString('base64url');
let refreshToken;
let registeredClientId;

const callback = deferred();
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname !== '/oauth/callback') {
    response.writeHead(404).end('Not found.');
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end('Postback OAuth approval received. You can close this tab.');
  callback.resolve(url);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const redirectUri = `http://127.0.0.1:${address.port}/oauth/callback`;

try {
  const registrationResponse = await fetch(`${apiOrigin}/oauth/register`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Postback production OAuth smoke',
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(registrationResponse.status, 201, 'OAuth client registration failed');
  const registration = await registrationResponse.json();
  assert.match(registration.client_id, /^agent_client_/);
  assert.deepEqual(registration.redirect_uris, [redirectUri]);
  registeredClientId = registration.client_id;

  const authorizationUrl = new URL(authorizationEndpoint);
  authorizationUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: registration.client_id,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource,
    scope: scopes.join(' '),
    state,
  }).toString();

  process.stdout.write(
    `Authorize the read-only production smoke connection:\n${authorizationUrl}\n`,
  );
  if (process.env.POSTBACK_OAUTH_OPEN_BROWSER !== 'false') {
    openBrowser(authorizationUrl.toString());
  }

  const approvalTimeout = setTimeout(
    () => callback.reject(new Error('OAuth approval timed out after five minutes')),
    5 * 60_000,
  );
  const callbackUrl = await callback.promise.finally(() => {
    clearTimeout(approvalTimeout);
  });
  assert.equal(callbackUrl.searchParams.get('state'), state, 'OAuth state mismatch');
  assert.equal(callbackUrl.searchParams.get('iss'), apiOrigin, 'OAuth issuer mismatch');
  assert.equal(callbackUrl.searchParams.get('error'), null, 'OAuth authorization was denied');
  const code = callbackUrl.searchParams.get('code');
  assert.ok(code, 'OAuth callback did not include an authorization code');

  const initialTokens = await exchangeToken(new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: registration.client_id,
    redirect_uri: redirectUri,
    resource,
    code_verifier: verifier,
  }));
  refreshToken = initialTokens.refresh_token;
  await assertMcpRead(initialTokens.access_token, 'authorization-code token');

  const refreshedTokens = await exchangeToken(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: registration.client_id,
    resource,
  }));
  refreshToken = refreshedTokens.refresh_token;
  await assertMcpRead(refreshedTokens.access_token, 'refreshed token');

  await revokeToken(refreshToken, registration.client_id);
  refreshToken = undefined;
  const revokedResponse = await mcpRequest(refreshedTokens.access_token, 'tools/list');
  assert.equal(revokedResponse.status, 401, 'Revoked OAuth grant still reached MCP');

  process.stdout.write(
    'Production OAuth registration, PKCE approval, token exchange, MCP read, refresh rotation, and revocation passed.\n',
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  if (refreshToken && registeredClientId) {
    try {
      await revokeToken(refreshToken, registeredClientId);
      process.stdout.write('Revoked the OAuth smoke grant during cleanup.\n');
    } catch {
      process.stderr.write(
        'Automatic cleanup failed; revoke the test connection in Postback.\n',
      );
    }
  }
}

async function exchangeToken(body) {
  const response = await fetch(`${apiOrigin}/oauth/token`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 200, `OAuth token exchange failed with HTTP ${response.status}`);
  const tokens = await response.json();
  assert.match(tokens.access_token, /^pb_oauth_/);
  assert.match(tokens.refresh_token, /^pb_refresh_/);
  assert.equal(tokens.token_type, 'Bearer');
  return tokens;
}

async function revokeToken(token, clientId) {
  const response = await fetch(`${apiOrigin}/oauth/revoke`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token, client_id: clientId }),
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 200, 'OAuth revocation failed');
}

async function assertMcpRead(token, label) {
  const listResponse = await mcpRequest(token, 'tools/list');
  assert.equal(listResponse.status, 200, `${label} could not list MCP tools`);
  const listed = await listResponse.json();
  assert.ok(
    listed.result?.tools?.some(({ name }) => name === 'list_apps'),
    `${label} did not receive list_apps`,
  );

  const callResponse = await mcpRequest(token, 'tools/call', {
    name: 'list_apps',
    arguments: {},
  });
  assert.equal(callResponse.status, 200, `${label} could not call list_apps`);
  const called = await callResponse.json();
  assert.notEqual(called.result?.isError, true, `${label} list_apps returned a tool error`);
}

function mcpRequest(token, method, params = {}) {
  return fetch(resource, {
    method: 'POST',
    redirect: 'error',
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': method,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `oauth-smoke-${method}`,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': {
            name: 'postback-oauth-smoke',
            version: '1.0.0',
          },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
}

function openBrowser(url) {
  const command = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  const child = spawn(command[0], command[1], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
