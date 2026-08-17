import type { Command } from 'commander';

import { authenticatedClient, emit, integer } from '../runtime.js';

export function registerSocialCommands(program: Command): void {
  const social = program
    .command('social')
    .description('inspect tracked social accounts and post view series');

  social
    .command('accounts <app-id>')
    .description('list TikTok, Instagram, and Facebook accounts being tracked')
    .action(async (appId: string) => {
      emit(
        program,
        await (await authenticatedClient()).socialAccounts(appId),
      );
    });

  social
    .command('posts <app-id>')
    .description('list tracked posts with daily view deltas')
    .option('--days <days>', 'lookback window from 1 to 90', integer(1, 90), 30)
    .option('--platform <platform>', 'tiktok, instagram, or facebook')
    .action(async (
      appId: string,
      options: { days: number; platform?: string },
    ) => {
      emit(
        program,
        await (await authenticatedClient()).socialPosts(appId, options),
      );
    });
}
