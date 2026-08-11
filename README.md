# Postback CLI

Revenue intelligence and controlled Apple Ads and TikTok Ads changes for
developers and AI agents.

The CLI connects acquisition, onboarding funnels, trials, subscription
revenue, and attribution evidence. It can also propose campaign, ad group, and
ad or keyword changes. Ad account writes only run after a human approves the
exact plan in Postback.

## Local development

```bash
npm install
npm run ci
node dist/index.js --help
```

The package remains private until its public package name and license are
approved. Build and test commands do not publish or deploy anything.
Maintainers should follow [RELEASING.md](./RELEASING.md) for the guarded npm
release process.

## Three hard safety rules

1. Authenticate before using any data command.
2. Every ad change starts as a plan built from live provider state.
3. Only the Postback dashboard can approve a plan. The CLI has no flag that can
   bypass approval.

Tokens are revocable, expire, and are restricted to one app. Provider write
permissions are separate scopes: `apple-ads:write` and `tiktok-ads:write`.

## Authentication

Create an agent token in the app's Postback Developer settings, then run:

```bash
postback auth login
```

For a headless environment:

```bash
export POSTBACK_TOKEN="pb_agent_..."
postback auth status
```

The CLI never accepts a token as a command-line option, which keeps it out of
shell history and process listings. Stored credentials use user-only file
permissions.

Authenticated requests go only to `https://api.postback.sh`. Local development
can set `POSTBACK_API_URL` to an HTTP or HTTPS loopback address. Other hosts are
rejected so an agent cannot redirect a token to a third party.

## Core agent workflow

```bash
# 1. Verify authentication and discover the app
postback auth status
postback apps

# 2. Read revenue and funnel evidence
postback analytics overview <app-id> --days 30
postback analytics funnels <app-id> --days 30
postback analytics tiktok-ads <app-id> --days 30

# 3. Create a plan. This does not change TikTok.
postback actions propose tiktok-campaign-budget <app-id> \
  --campaign-id <campaign-id> \
  --amount 120 \
  --currency USD \
  --reason "D30 paid ROAS is above the approved scaling threshold" \
  --idempotency-key scale-campaign-2026-08-09

# 4. Open the approvalUrl returned by the command and approve in Postback

# 5. Read status, then execute the approved plan exactly once
postback actions get <app-id> <plan-id>
postback actions execute <app-id> <plan-id>

# 6. Read the verified afterState in the result
```

Commands emit compact JSON by default, matching the Postiz agent CLI pattern.
Use `--pretty` for indented JSON or `--human` where concise human output is
available. Errors are structured JSON on stderr by default.

## Read commands

```text
postback auth login
postback auth status
postback auth logout
postback apps
postback diagnose <app-id> [--hours 24]
postback analytics overview <app-id> [--days 30]
postback analytics funnels <app-id> [--days 30]
postback analytics tiktok-ads <app-id> [--days 30]
postback integrations status <app-id>
postback events list <app-id> [--limit 50] [--before <timestamp>]
postback installs explain <postback-id>
```

## Apple Ads plans

```bash
# Enable or pause a campaign
postback actions propose apple-campaign-status <app-id> \
  --org-id <campaign-group-id> \
  --campaign-id <campaign-id> \
  --status PAUSED \
  --reason "Trial-adjusted ROAS has remained below the pause threshold"

# Change a campaign daily budget
postback actions propose apple-campaign-budget <app-id> \
  --org-id <campaign-group-id> \
  --campaign-id <campaign-id> \
  --amount 125 \
  --currency USD \
  --reason "D30 paid ROAS supports a bounded budget increase"

# Enable or pause a targeting keyword
postback actions propose apple-keyword-status <app-id> \
  --org-id <campaign-group-id> \
  --campaign-id <campaign-id> \
  --ad-group-id <ad-group-id> \
  --keyword-id <keyword-id> \
  --status PAUSED \
  --reason "The keyword spends without producing paid subscribers"

# Change a targeting keyword bid
postback actions propose apple-keyword-bid <app-id> \
  --org-id <campaign-group-id> \
  --campaign-id <campaign-id> \
  --ad-group-id <ad-group-id> \
  --keyword-id <keyword-id> \
  --amount 1.25 \
  --currency USD \
  --reason "Keyword subscriber ROAS supports a bounded bid increase"
```

Postback blocks manual keyword bids when the campaign uses Apple's Maximize
Conversions bidding strategy. It also blocks currency changes, deleted
keywords, no-op plans, daily budgets at or above a configured lifetime budget,
and increases above 50 percent per plan.

## TikTok Ads plans

Read ad-level performance first. The result includes the exact ad ID plus
spend, installs, trials, paid conversions, revenue, and ROAS:

```bash
postback analytics tiktok-ads <app-id> --days 30
```

```bash
# Enable or pause a campaign
postback actions propose tiktok-campaign-status <app-id> \
  --campaign-id <campaign-id> \
  --status DISABLE \
  --reason "Paid subscriber ROAS is below the approved pause threshold"

# Change a campaign-owned budget
postback actions propose tiktok-campaign-budget <app-id> \
  --campaign-id <campaign-id> \
  --amount 120 \
  --currency USD \
  --reason "Paid subscriber ROAS supports a bounded increase"

# Enable or pause an ad group
postback actions propose tiktok-adgroup-status <app-id> \
  --ad-group-id <ad-group-id> \
  --status DISABLE \
  --reason "This ad group spends without producing retained trials"

# Change an ad-group-owned budget
postback actions propose tiktok-adgroup-budget <app-id> \
  --ad-group-id <ad-group-id> \
  --amount 60 \
  --currency USD \
  --reason "This ad group has the strongest paid subscriber ROAS"

# Enable or pause one ad
postback actions propose tiktok-ad-status <app-id> \
  --ad-id <ad-id> \
  --status DISABLE \
  --reason "This ad spends without producing paid subscribers"
```

Postback reads the exact campaign, ad group, or ad before planning. If campaign
budget optimization owns the budget, an ad group budget plan is rejected. If
the campaign budget is infinite and the ad group owns spend control, campaign
budget changes are rejected instead. Smart+ campaigns use TikTok's separate
Smart+ read and write endpoints.

## Approval and execution commands

```text
postback actions list <app-id> [--limit 20]
postback actions get <app-id> <plan-id>
postback actions execute <app-id> <plan-id>
```

Execution performs these server-enforced steps:

1. Claim the approved plan exactly once.
2. Re-read the provider state.
3. Stop with `stale` if anything changed since the plan was created.
4. Send one provider mutation.
5. Re-read and verify the requested state.
6. Store the before state, provider request ID, after state, and audit events.

Plans expire after 30 minutes. A failed or ambiguous provider request is not
automatically replayed. Create a fresh plan after inspecting the recorded
result.

## Provider access required

Apple Ads credentials need an API role that can read and write campaigns. A
read-only API user will receive a provider authorization error.

For the full TikTok integration, the Postback developer app needs nine
permissions:

- Ad Account Information: Read Ad Account Information
- Campaign: Read Campaigns
- Campaign: Create and Update Campaigns
- Ad Group: Read Ad Groups
- Ad Group: Create and Update Ad Groups
- Ad: Read Ads
- Ad: Create and Update Ads
- Reporting: Consolidated Report
- Measurement: Report Pixel Event

TikTok bundles status and budget update endpoints into its broader Create and
Update permissions. Postback only exposes the bounded actions documented above;
it does not expose campaign, ad group, ad, or creative creation through the CLI.

Existing TikTok connections must reconnect after the developer app receives
the new permissions.
