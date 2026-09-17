---
summary: "In-repo hermes-fleet skill is a ClawHub distribution package, not a worker runtime."
read_when:
  - Changing fixtures/skills/hermes-fleet
  - Documenting Hermes fleet webhook contracts
  - Reviewing registry versus runtime boundaries for packaged skills
---

# Hermes fleet skill

`fixtures/skills/hermes-fleet/` is a publishable ClawHub skill that documents Hermes
fleet orchestration. It lives under `fixtures/skills/` because the repo-root
`skills/` directory is the ClawHub CLI install workdir and is gitignored. The
fixture exists so operators can install a versioned contract for `fleet.yaml`,
`HERMES_FLEET_WEBHOOK_URL`, and the start/status/scale/stop webhook actions.

This folder is not a ClawHub runtime. ClawHub must not start Hermes or OpenClaw
workers, store fleet secrets, or raise `max_concurrency` above 5. The local
validator reads YAML and prints request bodies. It must not POST to a webhook
or spawn paid workers.

The hermes-agent fleet webhook remains the runtime source of truth for
authentication, worker lifecycle, and enforcement of the concurrency cap.
Keep `secrets_ref` as environment variable names only.
