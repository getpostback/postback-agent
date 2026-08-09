import type { Command } from 'commander';

import { authenticatedClient, emit, integer } from '../runtime.js';

export function registerAnalyticsCommands(program: Command): void {
  const analytics = program
    .command('analytics')
    .description('understand acquisition, onboarding, conversion, and revenue');

  analytics
    .command('overview <app-id>')
    .description('show installs, events, trials, revenue, and sources')
    .option('--days <days>', 'lookback window from 1 to 90', integer(1, 90), 30)
    .action(async (appId: string, options: { days: number }) => {
      emit(
        program,
        await (await authenticatedClient()).analyticsOverview(appId, options.days),
      );
    });

  analytics
    .command('funnels <app-id>')
    .description('show onboarding and conversion performance and drop-offs')
    .option('--days <days>', 'lookback window from 1 to 90', integer(1, 90), 30)
    .action(async (appId: string, options: { days: number }) => {
      emit(
        program,
        await (await authenticatedClient()).funnelPerformance(appId, options.days),
      );
    });

  analytics
    .command('tiktok-ads <app-id>')
    .description('compare TikTok ads by spend, revenue, conversions, and ROAS')
    .option('--days <days>', 'lookback window from 1 to 90', integer(1, 90), 30)
    .action(async (appId: string, options: { days: number }) => {
      emit(
        program,
        await (await authenticatedClient()).tiktokAdPerformance(appId, options.days),
      );
    });
}
