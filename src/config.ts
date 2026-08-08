import { constants } from 'node:fs';
import {
  access,
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const DEFAULT_API_URL = 'https://api.postback.sh';
const TOKEN_PATTERN = /^pb_agent_[a-f0-9]{24}_[A-Za-z0-9_-]{32,}$/;

export type StoredCredentials = {
  token: string;
  apiUrl: string;
  savedAt: string;
};

export function credentialsPath(env: NodeJS.ProcessEnv = process.env): string {
  const configDir =
    env.POSTBACK_CONFIG_DIR?.trim()
    || join(homedir(), '.config', 'postback');
  return join(configDir, 'credentials.json');
}

export function resolveApiUrl(
  value = process.env.POSTBACK_API_URL ?? DEFAULT_API_URL,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('POSTBACK_API_URL must be a valid URL');
  }

  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const official = url.origin === DEFAULT_API_URL;
  if (!official && !local) {
    throw new Error(
      'POSTBACK_API_URL must use the official Postback API or a loopback host',
    );
  }
  if (
    (official && url.protocol !== 'https:')
    || (local && !['http:', 'https:'].includes(url.protocol))
  ) {
    throw new Error('POSTBACK_API_URL must use HTTPS or loopback HTTP');
  }
  if (
    url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw new Error(
      'POSTBACK_API_URL cannot contain a path, credentials, query, or fragment',
    );
  }
  return url.toString().replace(/\/$/, '');
}

export function validateAgentToken(value: string): string {
  const token = value.trim();
  if (!TOKEN_PATTERN.test(token)) {
    throw new Error('Expected a scoped Postback agent token');
  }
  return token;
}

export async function loadCredentials(
  env: NodeJS.ProcessEnv = process.env,
): Promise<StoredCredentials | null> {
  try {
    const raw = await readFile(credentialsPath(env), 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredCredentials>;
    if (
      typeof parsed.token !== 'string'
      || typeof parsed.apiUrl !== 'string'
      || typeof parsed.savedAt !== 'string'
    ) {
      throw new Error('Stored Postback credentials are malformed');
    }
    return {
      token: validateAgentToken(parsed.token),
      apiUrl: resolveApiUrl(parsed.apiUrl),
      savedAt: parsed.savedAt,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function resolveToken(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  if (env.POSTBACK_TOKEN?.trim()) return validateAgentToken(env.POSTBACK_TOKEN);
  return (await loadCredentials(env))?.token ?? null;
}

export async function resolveConfiguredApiUrl(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  if (env.POSTBACK_API_URL?.trim()) return resolveApiUrl(env.POSTBACK_API_URL);
  return (await loadCredentials(env))?.apiUrl ?? DEFAULT_API_URL;
}

export async function saveCredentials(
  credentials: StoredCredentials,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const path = credentialsPath(env);
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch(() => {});

  const temporaryPath = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(
        {
          token: validateAgentToken(credentials.token),
          apiUrl: resolveApiUrl(credentials.apiUrl),
          savedAt: credentials.savedAt,
        },
        null,
        2,
      )}\n`,
      { encoding: 'utf8', mode: 0o600, flag: 'wx' },
    );
    await rename(temporaryPath, path);
    await chmod(path, 0o600).catch(() => {});
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

export async function deleteCredentials(
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const path = credentialsPath(env);
  try {
    await access(path, constants.F_OK);
  } catch {
    return false;
  }
  await rm(path);
  return true;
}
