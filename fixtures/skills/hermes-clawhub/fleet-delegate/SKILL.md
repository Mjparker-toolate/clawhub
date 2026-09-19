---
name: fleet-delegate
description: Delegate fleet work to n8n REST agent-fleets. Optionally notify a loopback Hermes webhook. ClawHub is not the fleet runtime. Never auto-run installed skills or put secrets on CLI argv.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins:
        - curl
      env:
        - N8N_BASE_URL
        - N8N_API_KEY
        - N8N_PROJECT_ID
    primaryEnv: N8N_API_KEY
    envVars:
      - name: N8N_BASE_URL
        required: true
        description: n8n origin that serves REST, for example http://127.0.0.1:5678
      - name: N8N_API_KEY
        required: true
        description: n8n API key. Send it only as the X-N8N-API-KEY header from the environment.
      - name: N8N_PROJECT_ID
        required: true
        description: n8n project that already contains the coordinator and specialist agents.
      - name: N8N_AGENT_FLEET_ID
        required: false
        description: Existing fleet id for runs, messages, and feedback.
      - name: HERMES_FLEET_WEBHOOK_URL
        required: false
        description: Optional loopback Hermes fleet serve URL, for example http://127.0.0.1:8755
      - name: FLEET_HTTP_TOKEN
        required: false
        description: Optional Hermes fleet bearer token. Header only, never argv.
    homepage: https://github.com/Mjparker-toolate/n8n
---

# fleet-delegate

Use this skill to call the n8n `agent-fleets` REST module. That module is the
fleet protocol. ClawHub does not host fleets, start workers, or store
runtime secrets.

An optional Hermes webhook can keep a capped local pool of session slots.
Hermes is not the orchestrator.

Search and inspect before install.
Never auto-run a newly installed skill.
Never put secrets on CLI argv.

## Enable n8n agent-fleets

The module is opt-in. The common-case n8n builder does not load it.

```bash
export N8N_ENABLED_MODULES=agents,agent-fleets
# optional specialist runner; default is echo
export N8N_AGENT_FLEETS_RUNNER=delegate
```

`N8N_AGENT_FLEETS_RUNNER=delegate` routes member tool ids:

- `clawhub:<slug>` inspects a **local** ClawHub skill folder and may run its
  script entrypoint. That is n8n-side delegation, not ClawHub auto-run.
- `cursor-cloud` creates a Cursor cloud agent without putting
  `CURSOR_API_KEY` on a command line.
- any other tool id stays on echo.

A fleet member is an existing published project agent. n8n agents still own
identity, tools, memory, and model execution.

## n8n REST (source of truth)

Base path: `${N8N_BASE_URL}/rest/projects/${N8N_PROJECT_ID}/agent-fleets`

Send `X-N8N-API-KEY: ${N8N_API_KEY}`. Expand the env var in the shell. Do
not paste the key into argv.

| Method   | Path                                | Job                                       |
| -------- | ----------------------------------- | ----------------------------------------- |
| `POST`   | `/`                                 | Create a fleet (exactly one coordinator)  |
| `GET`    | `/`                                 | List fleets in the project                |
| `GET`    | `/:fleetId`                         | Read one fleet                            |
| `DELETE` | `/:fleetId`                         | Delete one fleet                          |
| `POST`   | `/:fleetId/members`                 | Add a member                              |
| `PATCH`  | `/:fleetId/members/:agentId`        | Update a member                           |
| `POST`   | `/:fleetId/runs`                    | Start a task graph                        |
| `GET`    | `/:fleetId/runs/:runId`             | Read a run                                |
| `POST`   | `/:fleetId/runs/:runId/cancel`      | Cancel a run                              |
| `GET`    | `/:fleetId/runs/:runId/messages`    | List typed messages                       |
| `POST`   | `/:fleetId/runs/:runId/messages`    | Send a typed message                      |
| `POST`   | `/:fleetId/feedback`                | Record `up` / `down`                      |
| `GET`    | `/:fleetId/specialization/:agentId` | Read a specialization proposal            |
| `POST`   | `/:fleetId/specialization`          | Apply a specialization to the member spec |

Graph node kinds: `coordinator`, `task`, `fan-out`, `fan-in`.
Message types: `task.assign`, `task.result`, `task.fail`, `task.cancel`,
`coordination.ask`, `coordination.reply`.

Example bodies live in `examples/`. Print a curl line without touching the
network:

```bash
bun fixtures/skills/hermes-clawhub/scripts/validate-skill-set.ts --print-request n8n-create-fleet
bun fixtures/skills/hermes-clawhub/scripts/validate-skill-set.ts --print-request n8n-create-run
```

Then POST only when an operator asks, using the printed command. The
script itself never opens a socket.

## Optional Hermes webhook

Use this only when the operator also wants a capped local Hermes session
pool. Bind stays loopback. Token stays in `FLEET_HTTP_TOKEN`.

```bash
hermes fleet serve --host 127.0.0.1 --port 8755
bun fixtures/skills/hermes-clawhub/scripts/validate-skill-set.ts --print-request hermes-start
```

| Method | Path                | Success         |
| ------ | ------------------- | --------------- |
| `GET`  | `/health`           | `200` (no auth) |
| `POST` | `/fleet/start`      | `201`           |
| `GET`  | `/fleet/{id}`       | `200`           |
| `POST` | `/fleet/{id}/scale` | `200`           |
| `POST` | `/fleet/{id}/stop`  | `200`           |

v1 invariants from hermes-agent: `max_concurrency` ≤ 5, loopback callback
and bind, `secrets_ref` names only, `kill_switch=true` refuses start and
scale-up.

HTTP callers have no parent Hermes turn, so workers are idle session slots.
Drive LLM work through existing Hermes webhook or cron paths, or through
n8n agents. Do not treat Hermes start as permission to run a newly
installed ClawHub skill.

## Runtime boundary

ClawHub may host and version this skill. It may not run n8n, bind Hermes
`fleet serve`, store `N8N_API_KEY` / `FLEET_HTTP_TOKEN`, or raise the
Hermes concurrency cap.
