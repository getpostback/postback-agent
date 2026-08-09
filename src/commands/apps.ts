import type { Command } from 'commander';

import { authenticatedClient, emit, integer } from '../runtime.js';

export function registerAppCommands(program: Command): void {
  program
    .command('apps')
    .description('list apps visible to the active token')
    .action(async () => {
      emit(program, await (await authenticatedClient()).listApps());
    });

  program
    .command('diagnose <app-id>')
    .description('check ingestion, attribution, and integration health')
    .option('--hours <hours>', 'lookback window from 1 to 168', integer(1, 168), 24)
    .action(async (appId: string, options: { hours: number }) => {
      emit(
        program,
        await (await authenticatedClient()).diagnoseApp(appId, options.hours),
      );
    });
}
