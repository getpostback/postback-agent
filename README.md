# Postback CLI

Read-only access to Postback attribution, events, revenue analytics, and
integration health for developers and AI agents.

## Local development

```bash
npm install
npm run ci
node dist/index.js --help
```

The package is intentionally marked private until the public package name and
license are approved. No publish or deployment command runs as part of the
build.

## Authentication

Create a scoped agent token in Postback Developer settings, then either run:

```bash
postback auth login
```

or set it for a headless environment:

```bash
export POSTBACK_TOKEN="pb_agent_..."
```

Tokens are revocable, expire, and are restricted to a single app. The CLI
never accepts a token as a command-line option, which keeps it out of shell
history and process listings.

Authenticated requests go only to `https://api.postback.sh`. Local development
may set `POSTBACK_API_URL` to an HTTP or HTTPS loopback address; other hosts are
rejected so an agent cannot redirect a token to a third-party server.

## Commands

```text
postback auth login
postback auth status
postback auth logout
postback apps
postback diagnose <app-id>
postback analytics overview <app-id>
postback integrations status <app-id>
postback events list <app-id>
postback installs explain <postback-id>
```

Pass `--json` for compact machine-readable output. In JSON mode, stdout contains
only JSON and errors are written to stderr.
