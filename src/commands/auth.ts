import type { Command } from 'commander';

import { PostbackClient } from '../client.js';
import {
  deleteCredentials,
  resolveApiUrl,
  saveCredentials,
  validateAgentToken,
} from '../config.js';
import { readHiddenToken } from '../prompt.js';
import {
  clientForToken,
  emit,
  requireToken,
} from '../runtime.js';

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('manage agent authentication');
  auth
    .command('login')
    .description('validate and securely save a scoped agent token')
    .action(async () => {
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
    .description('verify the active agent token and its scopes')
    .action(async () => {
      const result = await (await clientForToken(await requireToken())).me();
      emit(program, result, () => 'Authenticated with a valid scoped agent token.');
    });

  auth
    .command('logout')
    .description('remove locally stored credentials')
    .action(async () => {
      const removed = await deleteCredentials();
      emit(program, {
        data: {
          removed,
          environmentTokenActive: Boolean(process.env.POSTBACK_TOKEN?.trim()),
        },
        meta: { requestId: null, apiVersion: '2026-08-09' },
      }, () => removed ? 'Stored credentials removed.' : 'No stored credentials found.');
    });
}
