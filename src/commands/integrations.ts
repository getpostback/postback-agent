import type { Command } from 'commander';

import { authenticatedClient, emit } from '../runtime.js';

export function registerIntegrationCommands(program: Command): void {
  const integrations = program
    .command('integrations')
    .description('inspect integration state');
  integrations
    .command('status <app-id>')
    .description('show connected and verified integrations')
    .action(async (appId: string) => {
      emit(
        program,
        await (await authenticatedClient()).integrationStatus(appId),
      );
    });
}
