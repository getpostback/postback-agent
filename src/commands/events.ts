import { InvalidArgumentError, type Command } from 'commander';

import { authenticatedClient, emit, integer } from '../runtime.js';

export function registerEventCommands(program: Command): void {
  const events = program.command('events').description('inspect safe event metadata');
  events
    .command('list <app-id>')
    .description('list recent events without raw parameters or request context')
    .option('--limit <limit>', 'number of events from 1 to 100', integer(1, 100), 50)
    .option('--before <timestamp>', 'ISO timestamp cursor')
    .action(async (
      appId: string,
      options: { limit: number; before?: string },
    ) => {
      if (options.before && Number.isNaN(new Date(options.before).getTime())) {
        throw new InvalidArgumentError('--before must be an ISO timestamp');
      }
      emit(
        program,
        await (await authenticatedClient()).listEvents(appId, options),
      );
    });
}
