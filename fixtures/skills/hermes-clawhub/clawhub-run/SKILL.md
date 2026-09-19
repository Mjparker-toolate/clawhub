---
name: clawhub-run
description: Run an already-installed ClawHub skill only after an explicit operator request. Never auto-run a newly installed skill. Never put secrets on CLI argv.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins:
        - clawhub
    homepage: https://github.com/Mjparker-toolate/clawhub
---

# clawhub-run

Use this skill when an operator asks to execute a skill that is already
installed locally. ClawHub has no `run` command. OpenClaw and Hermes read
the installed `SKILL.md` and follow it. This skill does not install.

Search and inspect before install.
Never auto-run a newly installed skill.
Never put secrets on CLI argv.

## Preconditions

All of these must already be true:

1. The slug is present in `clawhub list` / the lockfile.
2. You inspected the listing (and the on-disk `SKILL.md`) before this turn.
3. The operator explicitly asked to run this slug now.
4. The skill was not installed in the same turn as this run.

If any check fails, go back to `clawhub-search` / `clawhub-install`. Do not
"just try it."

```bash
clawhub list
clawhub inspect @owner/slug --file SKILL.md
```

## How to run

1. Read `<workdir>/skills/<slug>/SKILL.md`.
2. Export declared env names. Put values in the environment or a local
   secret manager. Do not put values on argv.
3. Follow that skill's own run steps inside OpenClaw or Hermes.
4. If the skill shells out, pass only non-secret flags. Tokens stay in
   `$ENV_NAME`.

```bash
# values belong in the environment, not on the command line
export EXAMPLE_API_KEY
# then invoke the installed skill through OpenClaw or Hermes
```

## Refuse these paths

- Auto-running a skill because `clawhub install` just succeeded.
- Running a skill that was only searched, never inspected.
- `clawhub login --token <literal>` or `curl -H "Authorization: Bearer <literal>"`.
- Starting an n8n fleet or Hermes webhook as a side effect of run.

Fleet work is `fleet-delegate`. Learning from the run is `hermes-learn`.
