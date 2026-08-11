import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const token = process.env.POSTBACK_TOKEN?.trim();
assert.ok(token, 'Set POSTBACK_TOKEN to a scoped production agent token');

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const executable = join(projectRoot, 'dist', 'index.js');
const configDirectory = await mkdtemp(join(tmpdir(), 'postback-cli-production-'));
const testAppId = process.env.POSTBACK_TEST_APP_ID?.trim();
let commandCount = 0;

function run(args) {
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      POSTBACK_API_URL: 'https://api.postback.sh',
      POSTBACK_CONFIG_DIR: configDirectory,
      POSTBACK_TOKEN: token,
    },
  });
  assert.equal(
    result.status,
    0,
    `postback ${args.join(' ')} failed: ${result.stderr.slice(0, 500)}`,
  );
  const payload = JSON.parse(result.stdout);
  assert.ok(payload.data && payload.meta, `postback ${args.join(' ')} returned an invalid envelope`);
  commandCount += 1;
  return payload;
}

try {
  run(['auth', 'status']);
  run(['apps']);

  if (testAppId) {
    run(['diagnose', testAppId, '--hours', '24']);
    run(['analytics', 'overview', testAppId, '--days', '7']);
    run(['analytics', 'funnels', testAppId, '--days', '7']);
    run(['analytics', 'tiktok-ads', testAppId, '--days', '7']);
    run(['integrations', 'status', testAppId]);
    run(['events', 'list', testAppId, '--limit', '5']);
  }

  process.stdout.write(
    `Authenticated production CLI smoke passed ${commandCount} read-only commands.\n`,
  );
} finally {
  await rm(configDirectory, { recursive: true, force: true });
}
