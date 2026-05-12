#!/bin/bash
# .claude/hooks/session-start.sh
#
# SessionStart hook for Claude Code on the web. Installs node_modules
# for the three npm projects in this repo so the lint / typecheck /
# test commands work out of the gate.
#
# Subprojects (each has its own package.json + package-lock.json):
#   - .            Next.js admin + marketing site
#   - worker/      background job worker (vitest)
#   - mobile/      Expo React Native field app
#
# Gated on $CLAUDE_CODE_REMOTE so local-machine sessions don't
# re-run npm install on every start (the local dev already has
# node_modules and an editor watching it).
#
# Sync mode (no async): guarantees deps are installed before any
# tool that needs them runs. The container state is cached after
# the hook completes, so subsequent web sessions reuse the install.

set -euo pipefail

# Local sessions: bail out cleanly.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

install_in() {
  local dir="$1"
  if [ ! -f "$dir/package.json" ]; then
    echo "[session-start] no package.json in $dir — skipping" >&2
    return 0
  fi
  echo "[session-start] npm install in $dir" >&2
  (
    cd "$dir"
    # --no-audit / --no-fund / --no-progress shave seconds off
    # cold installs and stop the audit network call. npm's default
    # cache behavior already short-circuits already-installed deps,
    # so a warm container is fast without needing --prefer-offline
    # (which can wedge if any cached entry is missing).
    npm install --no-audit --no-fund --no-progress
  )
}

install_in .
install_in worker
install_in mobile

echo "[session-start] done — root + worker + mobile node_modules ready" >&2
