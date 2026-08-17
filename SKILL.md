---
name: postback
description: Match tracked social video views to app downloads and revenue, including by country, then propose approval-gated Apple Ads and TikTok Ads changes through the Postback CLI.
homepage: https://postback.sh/agents
metadata: {"openclaw":{"emoji":"📈","requires":{"bins":["postback"],"env":[]}}}
---

# Postback CLI

Use Postback to match TikTok, Instagram, and Facebook views to organic
installs and revenue, then connect that to onboarding, trials, and paid
subscriptions. The CLI can read that evidence and propose bounded Apple Ads
or TikTok Ads changes. A human must approve every external write in the
Postback dashboard.

## Four hard rules

1. Authenticate before doing anything else.
2. Read revenue and funnel evidence before proposing a change.
3. Never claim that a proposal changed an ad account. Only a succeeded
   `actions execute` result with a verified `afterState` proves execution.
4. Never ask for or expose `POSTBACK_TOKEN`, dashboard credentials, mobile SDK
   keys, or provider access tokens.

## Setup

Check authentication and discover the token's single allowed app:

```bash
postback auth status
postback apps
```

If authentication is missing, the user can run:

```bash
postback auth login
```

For a headless environment, the user can set `POSTBACK_TOKEN` outside the
conversation. Do not ask them to paste it into chat.

All output is compact JSON by default. Use `--pretty` only when a human needs
to inspect it. Do not parse `--human` output in an automation.

## Core workflow

1. Authenticate with `postback auth status`.
2. Discover the app with `postback apps`.
3. Diagnose data health with `postback diagnose` if evidence is missing.
4. Read country and source performance with `analytics overview`.
5. Rank tracked videos by estimated organic installs and revenue with `analytics content`.
6. Read onboarding and conversion drop-offs with `analytics funnels`.
7. Create one idempotent action plan with an evidence-based reason.
8. Return the plan's `approvalUrl` to the user and wait for dashboard approval.
9. Read the plan until `status` is `approved`.
10. Run `actions execute` once. Server-side idempotency makes a transport retry
    safe, but do not create a second plan for the same decision.
11. Report the verified `afterState`, or explain `stale` or `failed` without
    pretending the change succeeded.

## Read revenue evidence

```bash
postback analytics overview <app-id> --days 30
postback analytics content <app-id> --days 30 --country FR
postback social accounts <app-id>
postback social posts <app-id> --days 30
postback analytics funnels <app-id> --days 30
postback analytics tiktok-ads <app-id> --days 30
```

Keep installs, trials, paid conversions, refunds, revenue, and reporting
currency distinct. A correlation is not proof of causation. Treat a large
funnel drop as a place to investigate, then compare it with acquisition and
paid subscriber outcomes.

For setup or ingestion problems:

```bash
postback diagnose <app-id> --hours 24
postback integrations status <app-id>
postback events list <app-id> --limit 50
```

## Propose Apple Ads changes

```bash
postback actions propose apple-campaign-status <app-id> \
  --org-id <campaign-group-id> \
  --campaign-id <campaign-id> \
  --status PAUSED \
  --reason "Paid subscriber ROAS is below the approved pause threshold" \
  --idempotency-key <stable-key>

postback actions propose apple-campaign-budget <app-id> \
  --org-id <campaign-group-id> \
  --campaign-id <campaign-id> \
  --amount 125 \
  --currency USD \
  --reason "D30 paid ROAS supports a bounded increase" \
  --idempotency-key <stable-key>

postback actions propose apple-keyword-status <app-id> \
  --org-id <campaign-group-id> \
  --campaign-id <campaign-id> \
  --ad-group-id <ad-group-id> \
  --keyword-id <keyword-id> \
  --status PAUSED \
  --reason "The keyword spends without producing paid subscribers" \
  --idempotency-key <stable-key>

postback actions propose apple-keyword-bid <app-id> \
  --org-id <campaign-group-id> \
  --campaign-id <campaign-id> \
  --ad-group-id <ad-group-id> \
  --keyword-id <keyword-id> \
  --amount 1.25 \
  --currency USD \
  --reason "Keyword subscriber ROAS supports a bounded bid increase" \
  --idempotency-key <stable-key>
```

Do not propose a manual keyword bid for a Maximize Conversions campaign.
Postback rejects it even if requested. Do not propose currency changes or more
than a 50 percent increase in one plan.

## Propose TikTok Ads changes

Read the ad-level evidence before proposing an ad status change:

```bash
postback analytics tiktok-ads <app-id> --days 30
```

```bash
postback actions propose tiktok-campaign-status <app-id> \
  --campaign-id <campaign-id> \
  --status DISABLE \
  --reason "Paid subscriber ROAS is below the approved pause threshold" \
  --idempotency-key <stable-key>

postback actions propose tiktok-campaign-budget <app-id> \
  --campaign-id <campaign-id> \
  --amount 120 \
  --currency USD \
  --reason "Paid subscriber ROAS supports a bounded increase" \
  --idempotency-key <stable-key>

postback actions propose tiktok-adgroup-status <app-id> \
  --ad-group-id <ad-group-id> \
  --status DISABLE \
  --reason "The ad group spends without producing retained trials" \
  --idempotency-key <stable-key>

postback actions propose tiktok-adgroup-budget <app-id> \
  --ad-group-id <ad-group-id> \
  --amount 60 \
  --currency USD \
  --reason "This ad group has the strongest paid subscriber ROAS" \
  --idempotency-key <stable-key>

postback actions propose tiktok-ad-status <app-id> \
  --ad-id <ad-id> \
  --status DISABLE \
  --reason "This ad spends without producing paid subscribers" \
  --idempotency-key <stable-key>
```

TikTok campaign budget optimization determines whether the campaign or ad
group owns the effective budget. Do not guess. Postback reads both objects and
rejects a plan at the wrong level. Smart+ changes use separate provider
endpoints automatically.

## Approval and execution

After proposing, surface these fields:

- `plan.id`
- `plan.summary`
- `plan.beforeState`
- `plan.proposedState`
- `plan.risk`
- `plan.expiresAt`
- `plan.approvalUrl`

Check status:

```bash
postback actions get <app-id> <plan-id>
```

If status is `pending_approval`, wait for the user. Do not repeatedly ask them
to approve. If status is `rejected`, stop. If status is `expired` or `stale`,
read live evidence and create a new plan only if the recommendation still
holds.

Execute only after status is `approved`:

```bash
postback actions execute <app-id> <plan-id>
```

Success requires `status: "succeeded"` and a matching `providerResult.afterState`.
The server re-reads live state before execution, claims the plan once, applies
one provider mutation, and verifies the provider afterward.

## Error handling

- `401`: token is invalid, expired, revoked, or membership was removed.
- `403`: token lacks the provider-specific write scope or belongs to another
  app.
- `409` with `agent_action_approval_required`: return `details.approvalUrl` and
  wait.
- `429`: honor `Retry-After`. Safe reads and idempotent action requests can be
  retried.
- `stale`: provider state changed after planning. Do not execute the old plan.
- `failed`: inspect `errorCode`, `errorMessage`, and `providerResult`. Do not
  claim success and do not automatically replay an ambiguous provider write.
