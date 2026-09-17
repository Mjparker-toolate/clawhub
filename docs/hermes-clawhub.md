---
summary: "Install the Hermes-ClawHub skill set. Search and inspect before install, never auto-run a new skill, and call n8n REST agent-fleets for fleet work. ClawHub distributes; OpenClaw, Hermes, and n8n execute."
read_when:
  - Packaging the hermes-clawhub skill set
  - Calling n8n REST agent-fleets or an optional Hermes webhook
  - Explaining ClawHub registry versus OpenClaw, Hermes, or n8n runtime
---

# Hermes-ClawHub skill set

This page is the public operator guide for the tracked
`fixtures/skills/hermes-clawhub/` package. It mirrors the existing Hermes
operator skills in ClawHub-publishable form. The package does not run
workers.

ClawHub owns discovery, versioning, and install resolution. OpenClaw and
Hermes own skill execution. n8n owns the fleet protocol (`agent-fleets`).
That split is the product boundary in
[ClawHub](./clawhub.md#product-boundary) and
[`VISION.md`](https://github.com/openclaw/clawhub/blob/main/VISION.md).

## Safety rules

- Search and inspect before install.
- Never auto-run a newly installed skill.
- Never put secrets on CLI argv. Use environment variables or `clawhub login`
  config.

## Skills

| Skill             | Job                                                   |
| ----------------- | ----------------------------------------------------- |
| `clawhub-search`  | `clawhub search` / `inspect` only                     |
| `clawhub-install` | Install after inspect; leave the bundle inert         |
| `clawhub-run`     | Run an already-installed skill when the operator asks |
| `hermes-learn`    | Record what worked; do not install or run             |
| `fleet-delegate`  | Call n8n REST agent-fleets; optional Hermes webhook   |

The repo-root `skills/` directory is the CLI install workdir and is
gitignored. Preview without uploading to production:

```bash
clawhub skill publish ./fixtures/skills/hermes-clawhub --dry-run
clawhub skill publish ./fixtures/skills/hermes-clawhub/fleet-delegate --dry-run
```

Do not publish these folders to production ClawHub from a fork pull request.

## Search, inspect, install, run

```bash
clawhub search "postgres backups"
clawhub inspect @owner/slug --files
clawhub login
clawhub install @owner/slug
clawhub list
```

There is no `clawhub run` command. After an explicit operator request, OpenClaw
or Hermes reads the installed `SKILL.md`. A skill installed in the same turn
must not be invoked.

## Fleet protocol (n8n)

Enable the opt-in module on n8n:

```bash
export N8N_ENABLED_MODULES=agents,agent-fleets
export N8N_BASE_URL=http://127.0.0.1:5678
export N8N_PROJECT_ID=proj-1
# N8N_API_KEY stays in the environment
```

Create a fleet and start a run with the packaged examples. The local script
only prints curl. It never POSTs:

```bash
bun fixtures/skills/hermes-clawhub/scripts/validate-skill-set.ts --print-request n8n-create-fleet
bun fixtures/skills/hermes-clawhub/scripts/validate-skill-set.ts --print-request n8n-create-run
```

Routes live at
`${N8N_BASE_URL}/rest/projects/${N8N_PROJECT_ID}/agent-fleets`. Send
`X-N8N-API-KEY: ${N8N_API_KEY}`. A fleet has exactly one coordinator.
Member tool id `clawhub:<slug>` is n8n `delegate` runner behavior against a
local skill folder, not ClawHub auto-run.

## Optional Hermes webhook

If the operator also wants a capped local Hermes session pool:

```bash
hermes fleet serve --host 127.0.0.1 --port 8755
bun fixtures/skills/hermes-clawhub/scripts/validate-skill-set.ts --print-request hermes-start
```

Use `Authorization: Bearer ${FLEET_HTTP_TOKEN}`. Bind and
`webhook_callback_url` stay loopback. `max_concurrency` cannot exceed 5.
Hermes start/status/scale/stop are optional helpers. n8n remains the fleet
source of truth.

## Troubleshooting

- **Validator fails a safety rule:** every `SKILL.md` in the set must include
  the three sentences listed above.
- **Validator rejects `secrets_ref`:** replace tokens with names such as
  `OPENROUTER_API_KEY`.
- **Workers never appear:** ClawHub only distributed the skill. Confirm n8n
  `agent-fleets` is enabled and that any Hermes URL is `hermes fleet serve`,
  not an event-ingest webhook.

## See also

- [ClawHub](./clawhub.md#product-boundary): registry versus runtime.
- [How ClawHub works](./how-it-works.md): listings, installs, and publishing.
- [Skill format](./skill-format.md): `SKILL.md` frontmatter and env declarations.
- [CLI](./cli.md): `clawhub search`, `inspect`, `install`, and
  `skill publish --dry-run`.
- [Mjparker-toolate/n8n](https://github.com/Mjparker-toolate/n8n):
  `agent-fleets` REST module.
- [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent):
  optional loopback fleet webhook.
