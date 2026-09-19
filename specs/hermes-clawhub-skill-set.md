---
summary: "In-repo hermes-clawhub skill set is a ClawHub distribution package, not a worker or fleet runtime."
read_when:
  - Changing fixtures/skills/hermes-clawhub
  - Documenting n8n agent-fleets or the optional Hermes webhook
  - Reviewing registry versus runtime boundaries for packaged skills
---

# Hermes-ClawHub skill set

`fixtures/skills/hermes-clawhub/` is a publishable ClawHub mirror of the
existing Hermes operator skills: `clawhub-search`, `clawhub-install`,
`clawhub-run`, `hermes-learn`, and `fleet-delegate`. It lives under
`fixtures/skills/` because the repo-root `skills/` directory is the ClawHub
CLI install workdir and is gitignored.

This folder is not a ClawHub runtime and not an n8n module. ClawHub must not
start OpenClaw or Hermes workers, host agent-fleets, or store
`N8N_API_KEY` / `FLEET_HTTP_TOKEN`. The local validator reads `SKILL.md`
files and example JSON. It must not POST or spawn workers.

Safety invariants for every skill in the set:

- Search and inspect before install.
- Never auto-run a newly installed skill.
- Never put secrets on CLI argv.

Fleet protocol source of truth is n8n REST
`/rest/projects/:projectId/agent-fleets` (opt-in
`N8N_ENABLED_MODULES=agents,agent-fleets`). The optional Hermes webhook
(`hermes fleet serve`, loopback, `max_concurrency` ≤ 5, `secrets_ref` names
only) is a session-pool helper, not the orchestrator.
