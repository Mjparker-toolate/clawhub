---
name: clawhub-install
description: Install a ClawHub skill only after search and inspect. The install is inert. Never auto-run the new files and never put secrets on CLI argv.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins:
        - clawhub
    homepage: https://github.com/Mjparker-toolate/clawhub
---

# clawhub-install

Use this skill to download a ClawHub listing into the local workdir. ClawHub
resolves and extracts the bundle. It does not execute the skill.

Search and inspect before install.
Never auto-run a newly installed skill.
Never put secrets on CLI argv.

## Required inspect

Refuse to install until `clawhub-search` has produced an inspect of the same
`@owner/slug` (or `--version` / `--tag`) you are about to fetch:

```bash
clawhub inspect @owner/slug --files
```

Confirm owner, version, declared env, and scan status. If inspect fails or
the listing looks wrong, stop.

## Install

```bash
clawhub login
clawhub install @owner/slug
```

OpenClaw can install the same listing into an OpenClaw workspace:

```bash
openclaw skills install @owner/slug
```

Install writes:

- `<workdir>/<dir>/<slug>/` (default `./skills/<slug>`)
- `<workdir>/.clawhub/lock.json`
- `<skill>/.clawhub/origin.json`

Pinned skills refuse overwrite. Run `clawhub unpin <skill>` first only when
the operator asked to replace that pin.

Auth stays in the ClawHub config file from `clawhub login`. Do not pass a
token literal to `clawhub login --token` on argv.

## After install

Stop. The new folder is not permission to run.

- Do not follow the installed skill's "How to Run" section from this skill.
- Do not start n8n fleets or Hermes workers because an install succeeded.
- If the operator later wants execution, use `clawhub-run` on this already
  installed slug after a fresh inspect of what landed on disk.
