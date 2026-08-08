---
name: postback
description: Understand what drives app revenue across acquisition, onboarding funnels, conversion, attribution, events, and integrations through the read-only Postback CLI.
---

# Postback CLI

Use this skill when a user asks what drives app revenue, where users drop during
onboarding, which acquisition sources create paying users, or whether their
analytics and integrations are healthy.

## Safety boundary

- The CLI is read-only. It does not configure apps, rotate SDK keys, change
  billing, create integrations, or modify attribution records.
- Never ask the user to paste an agent token into chat.
- Never print, log, or echo `POSTBACK_TOKEN`.
- Do not use a mobile SDK key. Agent tokens are separate scoped credentials.
- Treat attribution as evidence-based and best effort. Report missing signals
  and uncertainty instead of inventing a cause.
- Do not infer access to an app that is absent from `postback apps --json`.

## Setup

The user creates a scoped agent token in Postback under the app's Developer
settings. Authentication can come from either:

```bash
export POSTBACK_TOKEN="pb_agent_..."
```

or an interactive prompt:

```bash
postback auth login
```

Run this before other work:

```bash
postback auth status --json
postback apps --json
```

## Command policy

Always pass `--json` when acting as an agent. JSON is written to stdout only.
Warnings and structured errors are written to stderr, and failed commands exit
non-zero.

### Diagnose an app

```bash
postback diagnose <app-id> --hours 24 --json
```

Use this first for setup, ingestion, attribution, RevenueCat, or Superwall
problems. Lead with `status` and `findings`. Do not treat zero traffic as proof
that the SDK is broken.

### Read analytics

```bash
postback analytics overview <app-id> --days 30 --json
```

Use the response's reporting currency. Keep installs, events, trials, refunds,
revenue, and source metrics distinct.

### Analyze onboarding and conversion funnels

```bash
postback analytics funnels <app-id> --days 30 --json
```

Use each funnel's `steps`, `completionRate`, and `largestDropOff` to explain
where users leave the path to revenue. Treat a large drop as a place to
investigate, not proof of causation. Compare it with acquisition and revenue
metrics before recommending what to optimize.

### Inspect integrations

```bash
postback integrations status <app-id> --json
```

`connected` means configuration exists. For RevenueCat and Superwall,
`verified` separately indicates whether the inbound webhook was verified.

### Inspect recent events

```bash
postback events list <app-id> --limit 50 --json
```

The response intentionally omits raw event parameters, IP addresses, user
agents, and device identifiers. Use `nextCursor` with `--before` for the next
page.

### Explain one install

```bash
postback installs explain <postback-id> --json
```

Explain the `status`, `source`, `matchType`, `reason`, `evidence`, and
`missingSignals`. An organic result means no eligible paid signal was selected;
it does not prove that the user never saw an ad.

## Error handling

- `401`: token is invalid, expired, revoked, or the user lost membership.
- `403`: the token lacks a required scope or is restricted to another app.
- `404`: the app or install is not visible to the active organization.
- `429`: wait for `Retry-After`; the CLI retries safe reads automatically.

When access is missing, ask the user to create or update a scoped agent token.
Do not ask for dashboard control credentials or mobile SDK keys.
