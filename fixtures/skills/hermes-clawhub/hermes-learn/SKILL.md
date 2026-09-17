---
name: hermes-learn
description: Record what a Hermes or OpenClaw operator learned from ClawHub search, inspect, install, or run. Learning does not install or auto-run skills and never puts secrets on CLI argv.
version: 1.0.0
metadata:
  openclaw:
    homepage: https://github.com/NousResearch/hermes-agent
---

# hermes-learn

Use this skill after a ClawHub search, inspect, install, or explicit run.
Hermes is the agent that grows with you. This skill writes notes, not
workers.

Search and inspect before install.
Never auto-run a newly installed skill.
Never put secrets on CLI argv.

## What to record

Keep notes in Hermes memory / the operator log:

- slug and owner that were inspected
- version or tag
- scan or moderation signal that mattered
- whether install was accepted or refused
- whether a later explicit run helped
- commands that worked, with env **names** only

Do not store token values, webhook secrets, or raw `Authorization` headers.

## What this skill must not do

- Search is not an install. Install is not a run.
- Do not call `clawhub install` because a previous note said a slug was useful.
- Do not invoke a newly installed skill to "verify" the note.
- Do not put secrets on CLI argv when refreshing inspect output.

## Optional n8n training feedback

If the operator is also running n8n `agent-fleets`, eval feedback can
propose a member specialization after three `down` ratings. That protocol
lives on n8n, not ClawHub:

```bash
# token stays in N8N_API_KEY; do not paste it on argv
curl -X POST "${N8N_BASE_URL}/rest/projects/${N8N_PROJECT_ID}/agent-fleets/${N8N_AGENT_FLEET_ID}/feedback" \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  --data '{"agentId":"spec-1","rating":"up","comment":"Inspect-then-install avoided a bad slug"}'
```

Apply writes the fleet member spec only. n8n agents still own
`AgentJsonConfig`. ClawHub does not host this route.
