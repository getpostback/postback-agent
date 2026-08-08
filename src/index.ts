import { Command, InvalidArgumentError } from 'commander';

import { PostbackClient, type AgentEnvelope } from './client.js';
import {
  deleteCredentials,
  loadCredentials,
  resolveApiUrl,
  resolveConfiguredApiUrl,
  resolveToken,
  saveCredentials,
  validateAgentToken,
} from './config.js';
import { writeError, writeJson, writePretty } from './output.js';
import { readHiddenToken } from './prompt.js';

type GlobalOptions = {
  json?: boolean;
};

export function createProgram() {
  const program = new Command()
    .name('postback')
    .description('Read-only Postback CLI for developers and AI agents')
    .version('0.1.0')
    .option('--json', 'emit compact machine-readable JSON');

  const auth = program.command('auth').description('manage agent authentication');
  auth
    .command('login')
    .description('validate and securely save a scoped agent token')
    .action(async () => {
      const globals = globalOptions(program);
      const envToken = process.env.POSTBACK_TOKEN?.trim();
      const token = validateAgentToken(envToken || (await readHiddenToken()));
      const apiUrl = resolveApiUrl(
        process.env.POSTBACK_API_URL ?? 'https://api.postback.sh',
      );
      const result = await new PostbackClient({ apiUrl, token }).me();
      if (!envToken) {
        await saveCredentials({ token, apiUrl, savedAt: new Date().toISOString() });
      }
      emit(program, result, () =>
        envToken
          ? 'Authenticated with POSTBACK_TOKEN. No credential was written to disk.'
          : 'Authenticated. The scoped token was saved with user-only file permissions.',
      );
    });

  auth
    .command('status')
    .description('verify the active agent token')
    .action(async () => {
      const token = await requireToken();
      const result = await (await clientFor(token)).me();
      emit(program, result, () => 'Authenticated with a valid scoped agent token.');
    });

  auth
    .command('logout')
    .description('remove locally stored credentials')
    .action(async () => {
      const removed = await deleteCredentials();
      const result = {
        data: {
          removed,
          environmentTokenActive: Boolean(process.env.POSTBACK_TOKEN?.trim()),
        },
        meta: { requestId: null, apiVersion: '2026-08-08' },
      };
      emit(program, result, () =>
        removed
          ? 'Stored credentials removed.'
          : 'No stored credentials were found.',
      );
    });

  program
    .command('apps')
    .description('list apps visible to the active token')
    .action(async () => {
      const result = await (await authenticatedClient()).listApps();
      emit(program, result, () => formatApps(result));
    });

  program
    .command('diagnose <app-id>')
    .description('check ingestion, attribution, and integration health')
    .option('--hours <hours>', 'lookback window from 1 to 168', integer(1, 168), 24)
    .action(async (appId: string, options: { hours: number }) => {
      const result = await (await authenticatedClient()).diagnoseApp(
        appId,
        options.hours,
      );
      emit(program, result, () => formatDiagnosis(result));
    });

  const analytics = program.command('analytics').description('read app analytics');
  analytics
    .command('overview <app-id>')
    .description('show installs, events, trials, revenue, and sources')
    .option('--days <days>', 'lookback window from 1 to 90', integer(1, 90), 30)
    .action(async (appId: string, options: { days: number }) => {
      const result = await (await authenticatedClient()).analyticsOverview(
        appId,
        options.days,
      );
      emit(program, result);
    });

  const integrations = program
    .command('integrations')
    .description('inspect integration state');
  integrations
    .command('status <app-id>')
    .description('show connected and verified integrations')
    .action(async (appId: string) => {
      const result = await (await authenticatedClient()).integrationStatus(
        appId,
      );
      emit(program, result);
    });

  const events = program.command('events').description('inspect safe event metadata');
  events
    .command('list <app-id>')
    .description('list recent events without raw parameters or request context')
    .option('--limit <limit>', 'number of events from 1 to 100', integer(1, 100), 50)
    .option('--before <timestamp>', 'ISO timestamp cursor')
    .action(
      async (
        appId: string,
        options: { limit: number; before?: string },
      ) => {
        if (options.before && Number.isNaN(new Date(options.before).getTime())) {
          throw new InvalidArgumentError('--before must be an ISO timestamp');
        }
        const result = await (await authenticatedClient()).listEvents(
          appId,
          options,
        );
        emit(program, result);
      },
    );

  const installs = program
    .command('installs')
    .description('explain stored attribution results');
  installs
    .command('explain <postback-id>')
    .description('show attribution evidence without raw device identifiers')
    .action(async (postbackId: string) => {
      const result = await (await authenticatedClient()).explainInstall(
        postbackId,
      );
      emit(program, result);
    });

  return program;
}

export async function main(argv = process.argv): Promise<void> {
  const program = createProgram();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    const json = Boolean(globalOptions(program).json);
    writeError(error, json);
    process.exitCode = 1;
  }
}

async function authenticatedClient(): Promise<PostbackClient> {
  return clientFor(await requireToken());
}

async function clientFor(token: string): Promise<PostbackClient> {
  return new PostbackClient({ apiUrl: await resolveConfiguredApiUrl(), token });
}

async function requireToken(): Promise<string> {
  const token = await resolveToken();
  if (!token) {
    throw new Error(
      'Not authenticated. Run `postback auth login` or set POSTBACK_TOKEN.',
    );
  }
  return token;
}

function globalOptions(program: Command): GlobalOptions {
  return program.opts<GlobalOptions>();
}

function emit(
  program: Command,
  value: AgentEnvelope | object,
  human?: () => string,
): void {
  if (globalOptions(program).json) {
    writeJson(value);
    return;
  }
  if (human) {
    process.stdout.write(`${human()}\n`);
    return;
  }
  writePretty(value);
}

function formatApps(envelope: AgentEnvelope): string {
  const apps = objectArray(envelope.data, 'apps');
  if (apps.length === 0) return 'No apps are visible to this token.';
  return apps
    .map((app) => `${stringField(app, 'name') ?? 'Unnamed app'}\t${stringField(app, 'id') ?? ''}`)
    .join('\n');
}

function formatDiagnosis(envelope: AgentEnvelope): string {
  const data = objectValue(envelope.data);
  const status = stringField(data, 'status') ?? 'unknown';
  const findings = objectArray(data, 'findings');
  const lines = [`Status: ${status}`];
  for (const finding of findings) {
    lines.push(
      `[${stringField(finding, 'severity') ?? 'info'}] ${stringField(finding, 'message') ?? ''}`,
    );
  }
  return lines.join('\n');
}

function integer(min: number, max: number) {
  return (value: string): number => {
    if (!/^\d+$/.test(value)) {
      throw new InvalidArgumentError(`Expected an integer from ${min} to ${max}`);
    }
    const parsed = Number(value);
    if (parsed < min || parsed > max) {
      throw new InvalidArgumentError(`Expected an integer from ${min} to ${max}`);
    }
    return parsed;
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function objectArray(value: unknown, key: string): Record<string, unknown>[] {
  const candidate = objectValue(value)[key];
  return Array.isArray(candidate)
    ? candidate.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object',
      )
    : [];
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === 'string' ? value[key] : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
