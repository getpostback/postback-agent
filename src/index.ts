import { Command } from 'commander';

import { registerActionCommands } from './commands/actions.js';
import { registerAnalyticsCommands } from './commands/analytics.js';
import { registerAppCommands } from './commands/apps.js';
import { registerAuthCommands } from './commands/auth.js';
import { registerEventCommands } from './commands/events.js';
import { registerInstallCommands } from './commands/installs.js';
import { registerIntegrationCommands } from './commands/integrations.js';
import { writeError } from './output.js';
import { globalOptions } from './runtime.js';

export function createProgram(): Command {
  const program = new Command()
    .name('postback')
    .description(
      'Revenue intelligence and approval-gated Apple Ads and TikTok Ads actions for AI agents',
    )
    .version('0.2.0')
    .option('--json', 'emit compact JSON (the default)')
    .option('--pretty', 'emit indented JSON')
    .option('--human', 'emit concise human-readable output when available');

  registerAuthCommands(program);
  registerAppCommands(program);
  registerAnalyticsCommands(program);
  registerIntegrationCommands(program);
  registerEventCommands(program);
  registerInstallCommands(program);
  registerActionCommands(program);
  return program;
}

export async function main(argv = process.argv): Promise<void> {
  const program = createProgram();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    writeError(error, !globalOptions(program).human);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
