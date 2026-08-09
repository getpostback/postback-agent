import type { Command } from 'commander';

import { authenticatedClient, emit } from '../runtime.js';

export function registerInstallCommands(program: Command): void {
  const installs = program
    .command('installs')
    .description('explain stored attribution results');
  installs
    .command('explain <postback-id>')
    .description('show attribution evidence without raw device identifiers')
    .action(async (postbackId: string) => {
      emit(
        program,
        await (await authenticatedClient()).explainInstall(postbackId),
      );
    });
}
