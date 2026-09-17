---
summary: "Install the Hermes fleet skill, validate fleet.yaml, and call start or stop on the hermes-agent fleet webhook. ClawHub distributes; OpenClaw and Hermes execute."
read_when:
  - Packaging Hermes fleet orchestration
  - Configuring HERMES_FLEET_WEBHOOK_URL or the concurrency cap
  - Explaining ClawHub registry versus OpenClaw or Hermes runtime
---

# Hermes fleet orchestration

This page is the public operator guide for the `hermes-fleet` skill. The skill
is a ClawHub package: a `SKILL.md` bundle plus an example `fleet.yaml` and a
local validator. It does not run workers.

ClawHub owns discovery, versioning, and install resolution. OpenClaw and Hermes
own runtime execution. That split is the product boundary in
[ClawHub](./clawhub.md#product-boundary) and in the repository
[`VISION.md`](https://github.com/openclaw/clawhub/blob/main/VISION.md).

## Before you begin

- A ClawHub CLI login if you will install or dry-run publish the skill.
- A Hermes deployment that exposes the fleet manager webhook from the
  hermes-agent fleet control plane. Event-ingest webhooks that turn GitHub or
  Stripe payloads into agent runs are a different surface.
- Environment names only. Do not put tokens in `fleet.yaml` or in this skill.

## Install the skill

After the skill is published under your publisher, install it with the ClawHub
CLI:

```bash
clawhub login
clawhub install @<owner>/hermes-fleet
```

Or install it into an OpenClaw workspace:

```bash
openclaw skills install @<owner>/hermes-fleet
```

This repository keeps the publishable folder at
`fixtures/skills/hermes-fleet/`. The repo-root `skills/` directory is the CLI
install workdir and is gitignored. Preview the bundle without uploading it to
the production registry:

```bash
clawhub skill publish ./fixtures/skills/hermes-fleet --dry-run
```

Do not publish the folder to production ClawHub from a fork pull request.

## Configure the webhook and cap

```bash
export HERMES_FLEET_WEBHOOK_URL=https://hermes.example.invalid/fleet
export HERMES_FLEET_MAX_CONCURRENCY=5
```

`HERMES_FLEET_WEBHOOK_URL` is required before any fleet action. The optional
`HERMES_FLEET_MAX_CONCURRENCY` value defaults to 5 and cannot exceed 5. Hermes
enforces the same ceiling so the packaged skill cannot request a larger fleet
than the runtime allows.

Point the URL at the hermes-agent fleet webhook, not at ClawHub. ClawHub never
hosts worker control planes or stores model-provider credentials.

## Validate fleet.yaml

The example manifest lives at `fixtures/skills/hermes-fleet/examples/fleet.yaml`.
It matches the hermes-agent fleet contract:

- `fleet_id`
- `max_concurrency` at most 5, default 5
- `worker_template`
- `webhook_callback_url`
- `secrets_ref` names only

Validate on disk. The script never opens a socket:

```bash
bun fixtures/skills/hermes-fleet/scripts/validate-fleet.ts ./fixtures/skills/hermes-fleet/examples/fleet.yaml
```

Print the JSON an operator would POST, still without calling Hermes:

```bash
bun fixtures/skills/hermes-fleet/scripts/validate-fleet.ts \
  --print-request start \
  ./fixtures/skills/hermes-fleet/examples/fleet.yaml
```

## Call start and stop

Hermes owns start, status, scale, and stop. After the file validates, POST the
printed body to `$HERMES_FLEET_WEBHOOK_URL`:

```bash
curl -X POST "$HERMES_FLEET_WEBHOOK_URL" \
  -H "content-type: application/json" \
  --data "$(bun fixtures/skills/hermes-fleet/scripts/validate-fleet.ts --print-request start ./fleet.yaml)"
```

Use `stop` to drain the same `fleet_id`. Use `status` or `scale` when the
Hermes fleet manager needs a read or a capped resize. The skill does not wrap
those calls in a launcher, scheduler, or CI hook.

## Troubleshooting

- **Validator rejects `max_concurrency`:** keep the value between 1 and 5.
  `HERMES_FLEET_MAX_CONCURRENCY=6` also fails.
- **Validator rejects `secrets_ref`:** replace tokens with names such as
  `HERMES_API_KEY`. Inline `secrets:` maps are rejected.
- **Webhook URL is unset:** the local check can still pass. The runtime call
  cannot. Set `HERMES_FLEET_WEBHOOK_URL` in the operator environment.
- **Workers never appear:** ClawHub only distributed the skill. Confirm Hermes
  received the POST and that the fleet manager, not the event-ingest webhook,
  is the configured URL.

## See also

- [ClawHub](./clawhub.md#product-boundary): registry versus runtime.
- [How ClawHub works](./how-it-works.md): listings, installs, and publishing.
- [Skill format](./skill-format.md): `SKILL.md` frontmatter and env declarations.
- [CLI](./cli.md): `clawhub install` and `clawhub skill publish --dry-run`.
- [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent):
  fleet webhook runtime and worker lifecycle.
