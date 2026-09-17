---
name: hermes-clawhub
description: Package the Hermes-ClawHub skill set for registry install. Search and inspect before install, never auto-run a newly installed skill, and never put secrets on CLI argv. Fleet work calls n8n REST agent-fleets, with an optional Hermes webhook.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins:
        - clawhub
    homepage: https://github.com/Mjparker-toolate/clawhub
---

# Hermes-ClawHub skill set

This folder is a ClawHub-publishable mirror of the existing Hermes-ClawHub
operator skills. ClawHub is the registry. OpenClaw and Hermes execute. n8n
owns the fleet protocol. This package does not start workers, spend provider
credits, or store secrets.

Search and inspect before install.
Never auto-run a newly installed skill.
Never put secrets on CLI argv.

## Skills in the set

Publish each child folder as its own listing, or dry-run the parent folder as
the set index. The repo-root `skills/` directory is the CLI install workdir
and is gitignored, so the tracked source lives here:

| Skill             | Folder             | Job                                                 |
| ----------------- | ------------------ | --------------------------------------------------- |
| `clawhub-search`  | `clawhub-search/`  | Search and inspect ClawHub listings                 |
| `clawhub-install` | `clawhub-install/` | Install only after inspect                          |
| `clawhub-run`     | `clawhub-run/`     | Run an already-installed skill on demand            |
| `hermes-learn`    | `hermes-learn/`    | Record what worked; do not install or run           |
| `fleet-delegate`  | `fleet-delegate/`  | Call n8n REST agent-fleets, optional Hermes webhook |

## Safety protocol

Use the skills in this order:

1. `clawhub-search` to find a slug, then `clawhub inspect` the listing.
2. `clawhub-install` only after the inspect output is acceptable.
3. Stop. A new install is inert until an operator asks to run it.
4. `clawhub-run` only for a skill that is already installed and inspected.
5. `hermes-learn` may record the outcome. It must not install or invoke.
6. `fleet-delegate` talks to n8n REST `/rest/projects/:projectId/agent-fleets`.
   The optional Hermes webhook is a loopback worker-pool helper, not the
   fleet source of truth.

Put tokens in the environment (`N8N_API_KEY`, `FLEET_HTTP_TOKEN`, or a
`clawhub login` config file). Do not pass token values to `clawhub`, `curl`,
or `hermes` as argv literals.

## Preview without publishing

```bash
clawhub skill publish ./fixtures/skills/hermes-clawhub --dry-run
clawhub skill publish ./fixtures/skills/hermes-clawhub/clawhub-search --dry-run
```

Do not publish this folder to production ClawHub from a fork pull request.

## Local check

The packaged script only reads files. It never POSTs to n8n or Hermes:

```bash
bun fixtures/skills/hermes-clawhub/scripts/validate-skill-set.ts
bun fixtures/skills/hermes-clawhub/scripts/validate-skill-set.ts --print-request n8n-create-fleet
```
