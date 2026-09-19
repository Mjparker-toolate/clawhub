#!/usr/bin/env bash
# ClawHub Cloud Agent environment: per-boot start phase.
# Brings up the local (anonymous) Convex backend and the Vite dev server, and
# seeds dev data on first boot only. Idempotent and safe to re-run; must return.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:/usr/local/bin:$PATH"
export CONVEX_AGENT_MODE=anonymous

log() { printf '\n[start] %s\n' "$*"; }

wait_for_http() { # url, timeout_seconds, expected_codes_regex
  local url="$1" timeout="${2:-120}" ok="${3:-200}" waited=0 code
  while [ "$waited" -lt "$timeout" ]; do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo 000)"
    if [[ "$code" =~ $ok ]]; then return 0; fi
    sleep 2; waited=$((waited + 2))
  done
  return 1
}

# --- 1. Local Convex backend (cloud functions :3210, HTTP routes :3211) ---
if [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3210/version 2>/dev/null || echo 000)" != "200" ]; then
  log "Starting local Convex backend"
  nohup bunx convex dev --typecheck=disable > /tmp/clawhub-convex.log 2>&1 &
  if ! wait_for_http "http://127.0.0.1:3210/version" 180 "200"; then
    log "Convex backend did not become ready; see /tmp/clawhub-convex.log"; tail -20 /tmp/clawhub-convex.log || true; exit 1
  fi
else
  log "Convex backend already running"
fi
log "Convex backend ready on http://127.0.0.1:3210"

# Backend env store is separate from .env.local; set idempotently.
bunx convex env set SITE_URL http://localhost:3000 >/dev/null 2>&1 || true

# --- 2. Seed dev data on first boot only (guarded by current skill count) ---
STATS_JSON="$(bunx convex run --no-push statsMaintenance:updateGlobalStatsAction '{}' 2>/dev/null || echo '{}')"
SKILL_COUNT="$(printf '%s' "$STATS_JSON" | grep -oE '"activeSkillsCount"[[:space:]]*:[[:space:]]*[0-9]+' | grep -oE '[0-9]+' | head -1 || echo 0)"
SKILL_COUNT="${SKILL_COUNT:-0}"
log "Current activeSkillsCount=$SKILL_COUNT"
if [ "$SKILL_COUNT" -lt 200 ]; then
  log "Seeding dev fixtures + public corpus (first boot, this can take a few minutes)"
  # Low concurrency / small batches keep each mutation under the local backend budget.
  bunx convex run --no-push devSeed:seedLocalFixtures '{}' || log "WARN seedLocalFixtures failed"
  bunx convex run --no-push devSeed:seedCanonicalSearchFixture '{}' || log "WARN seedCanonicalSearchFixture failed"
  bun scripts/public-corpus/seed-public-corpus.ts --concurrency 3 --batch-bytes 30000 || log "WARN public corpus seed incomplete"
  bun scripts/public-corpus/seed-catalog-presentation.ts || log "WARN catalog presentation seed incomplete"
  bunx convex run --no-push statsMaintenance:updateGlobalStatsAction '{}' >/dev/null 2>&1 || true
else
  log "Data already present; skipping seed"
fi

# --- 3. Vite dev server (http://localhost:3000) ---
if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ 2>/dev/null || echo 000)" != "200" ]; then
  log "Starting web dev server"
  nohup bun run dev > /tmp/clawhub-web.log 2>&1 &
  if ! wait_for_http "http://localhost:3000/" 180 "200"; then
    log "Web server did not become ready; see /tmp/clawhub-web.log"; tail -20 /tmp/clawhub-web.log || true; exit 1
  fi
else
  log "Web dev server already running"
fi
log "Web app ready on http://localhost:3000"

log "start complete"
