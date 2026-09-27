#!/usr/bin/env bash
# ClawHub Cloud Agent environment: idempotent install phase.
# Runs after the repo is checked out. Installs bun + JS deps and provisions the
# local (anonymous) Convex backend so functions are pushed and the local backend
# binary is cached into the snapshot. Must terminate.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf '\n[install] %s\n' "$*"; }

# --- 1. Ensure bun is available (project enforces bun via preinstall only-allow) ---
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"
if ! command -v bun >/dev/null 2>&1; then
  log "Installing bun"
  curl -fsSL https://bun.sh/install | bash
  export PATH="$BUN_INSTALL/bin:$PATH"
fi
# Make bun/bunx available to non-login shells (start phase, terminals).
if command -v sudo >/dev/null 2>&1; then
  sudo ln -sf "$BUN_INSTALL/bin/bun" /usr/local/bin/bun 2>/dev/null || true
  sudo ln -sf "$BUN_INSTALL/bin/bun" /usr/local/bin/bunx 2>/dev/null || true
fi
log "bun $(bun --version)"

# --- 2. Install JS dependencies (workspaces) ---
log "bun install"
bun install --frozen-lockfile

# --- 3. Ensure local Convex env config exists (.env.local is gitignored) ---
if [ ! -f .env.local ]; then
  log "Writing .env.local for local Convex"
  cat > .env.local <<'EOF'
# Frontend
VITE_CONVEX_URL=http://127.0.0.1:3210
VITE_CONVEX_SITE_URL=http://127.0.0.1:3211
VITE_ENABLE_DEV_AUTH=1
SITE_URL=http://localhost:3000
CONVEX_SITE_URL=http://127.0.0.1:3211

# Deployment used by `bunx convex dev` (anonymous local backend for cloud agents)
CONVEX_DEPLOYMENT=anonymous:anonymous-agent
CONVEX_AGENT_MODE=anonymous

# Local dev personas (login without GitHub OAuth)
DEV_AUTH_ENABLED=1
EOF
fi

# --- 4. Provision the local anonymous Convex backend and push functions ---
# `--once` downloads the local backend binary (cached into the snapshot) and
# pushes the current functions/schema, then exits.
log "Provisioning local Convex backend (convex dev --once)"
CONVEX_AGENT_MODE=anonymous bunx convex dev --once --typecheck=disable

log "install complete"
