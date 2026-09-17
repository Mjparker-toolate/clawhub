---
name: clawhub-search
description: Search ClawHub and inspect a listing before any install. Public search needs no token. Do not install from search hits and do not put secrets on CLI argv.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins:
        - clawhub
    homepage: https://github.com/Mjparker-toolate/clawhub
---

# clawhub-search

Use this skill to find and inspect ClawHub listings. It does not install or
run skills.

Search and inspect before install.
Never auto-run a newly installed skill.
Never put secrets on CLI argv.

## Search

```bash
clawhub search "postgres backups"
clawhub search --exact map
clawhub explore --limit 25 --sort newest
```

Search calls `/api/v1/search?q=...`. Output includes slug, owner handle,
display name, and relevance. Public catalog reads do not need a token.

If a listing should appear but does not, inspect it while logged in so owner
moderation diagnostics are visible. Use `clawhub login` (device flow). Do not
run `clawhub login --token` with a literal token on argv.

## Inspect before any install

```bash
clawhub inspect @owner/slug
clawhub inspect @owner/slug --files
clawhub inspect @owner/slug --versions --limit 20
clawhub inspect @owner/slug --file SKILL.md
```

Inspect fetches metadata and version files without writing `./skills`. Read
the summary, declared env, scan status, and `SKILL.md` before calling
`clawhub-install`.

## Stop here

This skill ends at search plus inspect. Do not chain `clawhub install` or
invoke the listing. A later `clawhub-run` is a separate operator decision.
