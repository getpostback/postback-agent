import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  credentialsPath,
  deleteCredentials,
  loadCredentials,
  resolveConfiguredApiUrl,
  resolveApiUrl,
  resolveToken,
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

  it('prefers an environment token while retaining the stored API URL', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'postback-cli-'));
    const storedToken = `pb_agent_${'c'.repeat(24)}_${'d'.repeat(43)}`;
    const environmentToken = `pb_agent_${'e'.repeat(24)}_${'f'.repeat(43)}`;
    await saveCredentials(
      {
        token: storedToken,
        apiUrl: 'http://127.0.0.1:8787',
        savedAt: '2026-08-08T00:00:00.000Z',
      },
      { POSTBACK_CONFIG_DIR: directory },
    );

    const env = {
      POSTBACK_CONFIG_DIR: directory,
      POSTBACK_TOKEN: environmentToken,
    };
    expect(await resolveToken(env)).toBe(environmentToken);
    expect(await resolveConfiguredApiUrl(env)).toBe('http://127.0.0.1:8787');
  });

  it('rejects malformed stored credentials', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'postback-cli-'));
    await mkdir(directory, { recursive: true });
    await writeFile(
      credentialsPath({ POSTBACK_CONFIG_DIR: directory }),
      JSON.stringify({ token: TOKEN }),
    );

    await expect(loadCredentials({ POSTBACK_CONFIG_DIR: directory })).rejects
      .toThrow('Stored Postback credentials are malformed');
  });

  it('rejects credentials, query strings, fragments, and non-loopback hosts in API URLs', () => {
    expect(() => resolveApiUrl('https://user:pass@api.postback.sh')).toThrow();
    expect(() => resolveApiUrl('https://api.postback.sh?token=value')).toThrow();
    expect(() => resolveApiUrl('https://api.postback.sh#fragment')).toThrow();
    expect(() => resolveApiUrl('http://192.168.1.20:8787')).toThrow();
    expect(resolveApiUrl('http://[::1]:8787')).toBe('http://[::1]:8787');
  });
});
