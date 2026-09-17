---
name: hermes-fleet
description: Package Hermes fleet orchestration for OpenClaw and Hermes workers. Install the skill from ClawHub, validate fleet.yaml locally, then call start, status, scale, or stop on the hermes-agent fleet webhook.
version: 1.0.0
metadata:
  openclaw:
    requires:
      env:
        - HERMES_FLEET_WEBHOOK_URL
    primaryEnv: HERMES_FLEET_WEBHOOK_URL
    envVars:
      - name: HERMES_FLEET_WEBHOOK_URL
        required: true
        description: Hermes fleet manager webhook URL owned by hermes-agent. ClawHub never hosts this endpoint.
      - name: HERMES_FLEET_MAX_CONCURRENCY
        required: false
        description: Optional concurrency cap. Defaults to 5 and cannot exceed 5.
    homepage: https://github.com/NousResearch/hermes-agent
---

# Hermes fleet orchestration

Use this skill when an operator needs a ClawHub-installable package for Hermes
fleet control. The skill documents the fleet manifest, the local validation
check, and the webhook actions Hermes owns. It does not start workers, spend
provider credits, or replace OpenClaw or Hermes.

ClawHub is the registry. OpenClaw and Hermes are the runtime. See the ClawHub
Vision product boundary: ClawHub distributes versioned skills; OpenClaw and
Hermes execute them.

## Install from ClawHub

Install the published skill with the ClawHub CLI after it has been released
under your publisher. This repository keeps the publishable source at
`fixtures/skills/hermes-fleet/` because `skills/` is the local CLI install
directory and is gitignored:

```bash
clawhub login
clawhub install @<owner>/hermes-fleet
```

OpenClaw can install the same listing into an OpenClaw workspace:

```bash
openclaw skills install @<owner>/hermes-fleet
```

Preview a local folder without uploading it to the production registry:

```bash
clawhub skill publish ./fixtures/skills/hermes-fleet --dry-run
```

Do not publish this folder to production ClawHub from a fork pull request.

## Configure the fleet webhook

Set the Hermes fleet manager URL in the operator environment. ClawHub does not
store this URL or any runtime secret.

```bash
export HERMES_FLEET_WEBHOOK_URL=https://hermes.example.invalid/fleet
export HERMES_FLEET_MAX_CONCURRENCY=5
```

Rules:

- `HERMES_FLEET_WEBHOOK_URL` is required before any start, status, scale, or
  stop call.
- `HERMES_FLEET_MAX_CONCURRENCY` is optional. When omitted, the skill uses the
  manifest `max_concurrency`, which defaults to 5.
- Neither the env cap nor the manifest may exceed 5. Hermes enforces the same
  ceiling so a packaged skill cannot ask the runtime to stampede paid workers.
- Event-ingest Hermes webhooks that turn GitHub or Stripe payloads into agent
  runs are a different surface. This skill talks only to the fleet control
  webhook.

## Validate fleet.yaml

Copy `examples/fleet.yaml` and keep `secrets_ref` as names only:

```yaml
fleet_id: example-local-fleet
max_concurrency: 5
worker_template:
  runtime: hermes
  role: openclaw-worker
  command: hermes worker run
webhook_callback_url: https://operator.example.invalid/hooks/hermes-fleet
secrets_ref:
  - HERMES_API_KEY
  - OPERATOR_WEBHOOK_SECRET
```

Required fields:

- `fleet_id`: lowercase slug used by every fleet action.
- `max_concurrency`: integer from 1 to 5. Defaults to 5 when omitted.
- `worker_template.runtime`: `hermes` or `openclaw`.
- `webhook_callback_url`: `https` URL, or `http` only for localhost.
- `secrets_ref`: environment variable names. Never inline tokens.

Validate locally. The script reads YAML only and never calls the webhook:

```bash
bun fixtures/skills/hermes-fleet/scripts/validate-fleet.ts ./fixtures/skills/hermes-fleet/examples/fleet.yaml
```

Print the JSON body an operator would send, still without touching the network:

```bash
bun fixtures/skills/hermes-fleet/scripts/validate-fleet.ts \
  --print-request start \
  ./fixtures/skills/hermes-fleet/examples/fleet.yaml
```

## Call start, status, scale, and stop

Hermes owns the fleet webhook. After the local file validates, POST JSON to
`$HERMES_FLEET_WEBHOOK_URL`:

```bash
curl -X POST "$HERMES_FLEET_WEBHOOK_URL" \
  -H "content-type: application/json" \
  --data "$(bun fixtures/skills/hermes-fleet/scripts/validate-fleet.ts --print-request start ./fleet.yaml)"
```

Replace `start` with `status`, `scale`, or `stop`. The printed body is:

```json
{
  "action": "start",
  "fleet_id": "example-local-fleet",
  "max_concurrency": 5
}
```

`max_concurrency` is the effective cap after applying
`HERMES_FLEET_MAX_CONCURRENCY`. Hermes uses it on `start` and `scale` and
ignores it on `status` and `stop`.

Do not wire this skill to a launch loop, CI job, or agent tool that POSTs
without an operator. The packaged files are documentation plus a local schema
check. Paid worker spend happens only if someone points a real Hermes fleet
manager at a live provider.

## Runtime boundary

ClawHub may:

- host and version this skill
- show declared env vars and files
- scan the bundle

ClawHub may not:

- run Hermes or OpenClaw workers
- store model-provider keys or fleet webhook secrets
- raise the concurrency cap above 5

When the hermes-agent fleet webhook PR lands, treat that repository as the
source of truth for authentication, retries, and worker lifecycle. This skill
stays the installable description of the operator contract.
