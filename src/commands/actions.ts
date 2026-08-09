import { randomUUID } from 'node:crypto';
import { InvalidArgumentError, type Command } from 'commander';

import {
  authenticatedClient,
  currency,
  emit,
  integer,
  oneOf,
  positiveNumber,
  providerId,
} from '../runtime.js';

type PlanOptions = {
  reason: string;
  idempotencyKey?: string;
};

export function registerActionCommands(program: Command): void {
  const actions = program
    .command('actions')
    .description('propose, inspect, and execute human-approved ad changes');
  const propose = actions
    .command('propose')
    .description('create a plan from live provider state without changing ads');

  withPlanOptions(
    propose
      .command('apple-campaign-status <app-id>')
      .description('propose enabling or pausing one Apple Ads campaign')
      .requiredOption('--org-id <org-id>', 'Apple Ads campaign group ID', providerId)
      .requiredOption('--campaign-id <campaign-id>', 'Apple Ads campaign ID', providerId)
      .requiredOption(
        '--status <status>',
        'ACTIVE or PAUSED',
        oneOf(['ACTIVE', 'PAUSED'] as const),
      ),
  ).action(async (appId: string, options: PlanOptions & {
    orgId: string;
    campaignId: string;
    status: 'ACTIVE' | 'PAUSED';
  }) => proposeChange(program, appId, {
    ...planBase(options),
    actionKind: 'apple_ads.campaign_status',
    orgId: options.orgId,
    campaignId: options.campaignId,
    status: options.status,
  }));

  withPlanOptions(
    propose
      .command('apple-campaign-budget <app-id>')
      .description('propose changing one Apple Ads campaign daily budget')
      .requiredOption('--org-id <org-id>', 'Apple Ads campaign group ID', providerId)
      .requiredOption('--campaign-id <campaign-id>', 'Apple Ads campaign ID', providerId)
      .requiredOption(
        '--amount <amount>',
        'new daily budget',
        positiveNumber(1_000_000),
      )
      .requiredOption('--currency <code>', 'three-letter currency code', currency),
  ).action(async (appId: string, options: PlanOptions & {
    orgId: string;
    campaignId: string;
    amount: number;
    currency: string;
  }) => proposeChange(program, appId, {
    ...planBase(options),
    actionKind: 'apple_ads.campaign_daily_budget',
    orgId: options.orgId,
    campaignId: options.campaignId,
    dailyBudgetAmount: options.amount,
    currency: options.currency,
  }));

  withPlanOptions(
    propose
      .command('apple-keyword-status <app-id>')
      .description('propose enabling or pausing one Apple Ads keyword')
      .requiredOption('--org-id <org-id>', 'Apple Ads campaign group ID', providerId)
      .requiredOption('--campaign-id <campaign-id>', 'Apple Ads campaign ID', providerId)
      .requiredOption('--ad-group-id <ad-group-id>', 'Apple Ads ad group ID', providerId)
      .requiredOption('--keyword-id <keyword-id>', 'Apple Ads keyword ID', providerId)
      .requiredOption(
        '--status <status>',
        'ACTIVE or PAUSED',
        oneOf(['ACTIVE', 'PAUSED'] as const),
      ),
  ).action(async (appId: string, options: PlanOptions & {
    orgId: string;
    campaignId: string;
    adGroupId: string;
    keywordId: string;
    status: 'ACTIVE' | 'PAUSED';
  }) => proposeChange(program, appId, {
    ...planBase(options),
    actionKind: 'apple_ads.keyword_status',
    orgId: options.orgId,
    campaignId: options.campaignId,
    adGroupId: options.adGroupId,
    keywordId: options.keywordId,
    status: options.status,
  }));

  withPlanOptions(
    propose
      .command('apple-keyword-bid <app-id>')
      .description('propose changing one Apple Ads keyword bid')
      .requiredOption('--org-id <org-id>', 'Apple Ads campaign group ID', providerId)
      .requiredOption('--campaign-id <campaign-id>', 'Apple Ads campaign ID', providerId)
      .requiredOption('--ad-group-id <ad-group-id>', 'Apple Ads ad group ID', providerId)
      .requiredOption('--keyword-id <keyword-id>', 'Apple Ads keyword ID', providerId)
      .requiredOption('--amount <amount>', 'new keyword bid', positiveNumber(10_000))
      .requiredOption('--currency <code>', 'three-letter currency code', currency),
  ).action(async (appId: string, options: PlanOptions & {
    orgId: string;
    campaignId: string;
    adGroupId: string;
    keywordId: string;
    amount: number;
    currency: string;
  }) => proposeChange(program, appId, {
    ...planBase(options),
    actionKind: 'apple_ads.keyword_bid',
    orgId: options.orgId,
    campaignId: options.campaignId,
    adGroupId: options.adGroupId,
    keywordId: options.keywordId,
    bidAmount: options.amount,
    currency: options.currency,
  }));

  withPlanOptions(
    propose
      .command('tiktok-campaign-status <app-id>')
      .description('propose enabling or pausing one TikTok Ads campaign')
      .requiredOption('--campaign-id <campaign-id>', 'TikTok campaign ID', providerId)
      .requiredOption(
        '--status <status>',
        'ENABLE or DISABLE',
        oneOf(['ENABLE', 'DISABLE'] as const),
      ),
  ).action(async (appId: string, options: PlanOptions & {
    campaignId: string;
    status: 'ENABLE' | 'DISABLE';
  }) => proposeChange(program, appId, {
    ...planBase(options),
    actionKind: 'tiktok_ads.campaign_status',
    campaignId: options.campaignId,
    status: options.status,
  }));

  withPlanOptions(
    propose
      .command('tiktok-campaign-budget <app-id>')
      .description('propose changing one TikTok campaign-owned budget')
      .requiredOption('--campaign-id <campaign-id>', 'TikTok campaign ID', providerId)
      .requiredOption('--amount <amount>', 'new campaign budget', positiveNumber(10_000_000))
      .requiredOption('--currency <code>', 'advertiser currency code', currency),
  ).action(async (appId: string, options: PlanOptions & {
    campaignId: string;
    amount: number;
    currency: string;
  }) => proposeChange(program, appId, {
    ...planBase(options),
    actionKind: 'tiktok_ads.campaign_budget',
    campaignId: options.campaignId,
    budget: options.amount,
    currency: options.currency,
  }));

  withPlanOptions(
    propose
      .command('tiktok-adgroup-status <app-id>')
      .description('propose enabling or pausing one TikTok ad group')
      .requiredOption('--ad-group-id <ad-group-id>', 'TikTok ad group ID', providerId)
      .requiredOption(
        '--status <status>',
        'ENABLE or DISABLE',
        oneOf(['ENABLE', 'DISABLE'] as const),
      ),
  ).action(async (appId: string, options: PlanOptions & {
    adGroupId: string;
    status: 'ENABLE' | 'DISABLE';
  }) => proposeChange(program, appId, {
    ...planBase(options),
    actionKind: 'tiktok_ads.adgroup_status',
    adGroupId: options.adGroupId,
    status: options.status,
  }));

  withPlanOptions(
    propose
      .command('tiktok-adgroup-budget <app-id>')
      .description('propose changing one TikTok ad-group-owned budget')
      .requiredOption('--ad-group-id <ad-group-id>', 'TikTok ad group ID', providerId)
      .requiredOption('--amount <amount>', 'new ad group budget', positiveNumber(10_000_000))
      .requiredOption('--currency <code>', 'advertiser currency code', currency),
  ).action(async (appId: string, options: PlanOptions & {
    adGroupId: string;
    amount: number;
    currency: string;
  }) => proposeChange(program, appId, {
    ...planBase(options),
    actionKind: 'tiktok_ads.adgroup_budget',
    adGroupId: options.adGroupId,
    budget: options.amount,
    currency: options.currency,
  }));

  withPlanOptions(
    propose
      .command('tiktok-ad-status <app-id>')
      .description('propose enabling or pausing one TikTok ad')
      .requiredOption('--ad-id <ad-id>', 'TikTok ad ID', providerId)
      .requiredOption(
        '--status <status>',
        'ENABLE or DISABLE',
        oneOf(['ENABLE', 'DISABLE'] as const),
      ),
  ).action(async (appId: string, options: PlanOptions & {
    adId: string;
    status: 'ENABLE' | 'DISABLE';
  }) => proposeChange(program, appId, {
    ...planBase(options),
    actionKind: 'tiktok_ads.ad_status',
    adId: options.adId,
    status: options.status,
  }));

  actions
    .command('list <app-id>')
    .description('list recent plans and their approval or execution status')
    .option('--limit <limit>', 'number of plans from 1 to 100', integer(1, 100), 20)
    .action(async (appId: string, options: { limit: number }) => {
      emit(
        program,
        await (await authenticatedClient()).listActionPlans(appId, options.limit),
      );
    });

  actions
    .command('get <app-id> <plan-id>')
    .description('read the exact before, proposed, approval, and result state')
    .action(async (appId: string, planId: string) => {
      emit(
        program,
        await (await authenticatedClient()).getActionPlan(appId, planId),
      );
    });

  actions
    .command('execute <app-id> <plan-id>')
    .description('execute a dashboard-approved plan exactly once after a stale-state check')
    .action(async (appId: string, planId: string) => {
      emit(
        program,
        await (await authenticatedClient()).executeActionPlan(appId, planId),
      );
    });
}

function withPlanOptions(command: Command): Command {
  return command
    .requiredOption('--reason <reason>', 'evidence-based reason for the change')
    .option(
      '--idempotency-key <key>',
      'stable retry key; generated when omitted',
      parseIdempotencyKey,
    );
}

function planBase(options: PlanOptions) {
  return {
    idempotencyKey:
      options.idempotencyKey ?? `cli:${randomUUID()}`,
    rationale: options.reason,
  };
}

async function proposeChange(
  program: Command,
  appId: string,
  change: Record<string, unknown>,
): Promise<void> {
  emit(
    program,
    await (await authenticatedClient()).createActionPlan(appId, change),
  );
}

function parseIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length < 8
    || normalized.length > 128
    || !/^[A-Za-z0-9._:-]+$/.test(normalized)
  ) {
    throw new InvalidArgumentError(
      'Idempotency keys must be 8-128 characters using letters, numbers, dot, underscore, colon, or dash',
    );
  }
  return normalized;
}
