import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  credentialsPath,
  deleteCredentials,
  loadCredentials,
  resolveApiUrl,
  saveCredentials,
  validateAgentToken,
} from '../src/config.js';

const TOKEN = `pb_agent_${'a'.repeat(24)}_${'b'.repeat(43)}`;

describe('CLI credentials', () => {
  it('stores scoped credentials with user-only permissions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'postback-cli-'));
    const env = { POSTBACK_CONFIG_DIR: directory };
    await saveCredentials(
      { token: TOKEN, apiUrl: 'https://api.postback.sh', savedAt: '2026-08-08T00:00:00.000Z' },
      env,
    );

    expect(await loadCredentials(env)).toEqual({
      token: TOKEN,
      apiUrl: 'https://api.postback.sh',
      savedAt: '2026-08-08T00:00:00.000Z',
    });
    expect((await stat(credentialsPath(env))).mode & 0o777).toBe(0o600);
    expect(await readFile(credentialsPath(env), 'utf8')).not.toContain('pb_ios_');
    expect(await deleteCredentials(env)).toBe(true);
    expect(await loadCredentials(env)).toBeNull();
  });

  it('rejects mobile keys and unsafe API URLs', () => {
    expect(() => validateAgentToken('pb_ios_live_secret')).toThrow();
    expect(() => validateAgentToken(
      `pb_oauth_${'a'.repeat(24)}_${'b'.repeat(43)}`,
    )).toThrow();
    expect(() => resolveApiUrl('http://api.postback.sh')).toThrow();
    expect(() => resolveApiUrl('https://attacker.example')).toThrow();
    expect(() => resolveApiUrl('https://api.postback.sh/proxy')).toThrow();
    expect(resolveApiUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787');
  });
});
