#!/usr/bin/env bash
#
# worker/deploy/auto-update.sh — pull main and rebuild, when it is safe to do so.
#
# Run by a systemd timer every few minutes. Does nothing at all when nothing has changed, which
# is the overwhelmingly common case, so a quiet journal means "up to date" rather than "broken".
#
# ── WHY THIS IS NOT JUST `git pull && docker compose up -d --build` ─────────────────────────────
#
# That one-liner is what the runbook tells a human to type, and it is fine when a human is watching
# the output. Unattended it has three ways to hurt:
#
#   1. IT CAN DEPLOY OVER A LIVE RUN. A research run takes 20–30 minutes and may have spent money.
#      Rebuilding mid-run kills the container. `recoverInterruptedRuns` makes that survivable, not
#      free. So: skip the cycle while anything is in flight.
#
#   2. IT CAN LEAVE THE BOX DOWN. If a merge does not build, or boots unhealthy, the naive version
#      exits non-zero and walks away with the worker dead. THE PREVIOUS WORKER DIED BY SILENTLY
#      NEVER COMING BACK — an unattended updater that can repeat that is a regression, not a
#      feature. So: verify health after the rebuild, and roll back to the previous commit if the
#      new one does not come up.
#
#   3. IT CAN OVERLAP ITSELF. A build takes minutes; the timer fires every two. Two `docker compose
#      up --build` runs against the same project is a race. So: a lock, held for the whole cycle.
#
# ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────────────────────────
#
# It does not run migrations, touch seeds, or restart anything but this compose project. It does not
# deploy anything other than `main` — no tags, no branches, no arbitrary refs — because the machine
# that spends money should be reachable by exactly one reviewed path.

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/starr}"
WORKER_DIR="$REPO_DIR/worker"
HEALTH_URL="${HEALTH_URL:-http://localhost:3100/healthz}"
ACTIVE_URL="${ACTIVE_URL:-http://localhost:3100/research/active}"
LOCK_FILE="${LOCK_FILE:-/var/lock/starr-worker-auto-update.lock}"

# How long to wait for the new build to report healthy before calling it a failure and rolling
# back. A cold start pulls Playwright's browser and reconnects R2, Supabase and Redis; 180s is
# generous on purpose, because a rollback triggered by impatience is its own outage.
HEALTH_TIMEOUT_SECS="${HEALTH_TIMEOUT_SECS:-180}"

log() { printf '%s [auto-update] %s\n' "$(date -Is)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

# ── One at a time ──────────────────────────────────────────────────────────────────────────────
# `flock -n` fails immediately rather than queueing. If a previous cycle is still building, this
# one has nothing useful to add; the next tick will see the same commit and try again.
#
# REQUIRED, not best-effort. Two concurrent `docker compose up --build` runs against one project is
# the race this exists to prevent, so a missing flock is a hard failure rather than a silent
# downgrade to no locking — the systemd unit that runs this is on a Linux box where flock is part
# of util-linux and always present. `ALLOW_NO_LOCK=1` exists only so the script can be exercised
# on a developer machine without one; never set it on the box.
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "another cycle is already running; nothing to do"
    exit 0
  fi
elif [ "${ALLOW_NO_LOCK:-0}" = "1" ]; then
  log "WARNING: flock unavailable and ALLOW_NO_LOCK=1 — running unlocked (test mode only)"
else
  die "flock not found; refusing to run unlocked because concurrent builds would race"
fi

cd "$REPO_DIR" || die "repo not found at $REPO_DIR"

# ── Is there anything to do? ───────────────────────────────────────────────────────────────────
git fetch --quiet origin main || die "git fetch failed (network? credentials?)"

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse origin/main)"

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  # The common case. Silent on purpose — a journal full of "no change" is a journal nobody reads,
  # and the point of this file is that its output is worth reading.
  exit 0
fi

log "main moved: ${LOCAL_SHA:0:9} -> ${REMOTE_SHA:0:9}"

# ── Refuse to deploy over work in progress ─────────────────────────────────────────────────────
# Reads the key from the worker's own .env rather than taking it as an argument, so the unit file
# carries no secret.
API_KEY="$(grep -E '^WORKER_API_KEY=' "$WORKER_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'\r' || true)"

if [ -n "$API_KEY" ]; then
  ACTIVE_JSON="$(curl -fsS -H "Authorization: Bearer $API_KEY" "$ACTIVE_URL" 2>/dev/null || echo '')"
  if [ -n "$ACTIVE_JSON" ]; then
    ACTIVE_COUNT="$(printf '%s' "$ACTIVE_JSON" | sed -n 's/.*"count"[[:space:]]*:[[:space:]]*\([0-9]\+\).*/\1/p')"
    if [ -n "${ACTIVE_COUNT:-}" ] && [ "$ACTIVE_COUNT" -gt 0 ]; then
      log "deferring: $ACTIVE_COUNT research run(s) in flight — a rebuild would kill them"
      exit 0
    fi
  else
    # Could not ask. Deploying anyway might kill a paid run; deferring costs only minutes, and the
    # next tick asks again. When the worker is genuinely down, /healthz below is the path that
    # notices — not this one.
    log "deferring: could not read $ACTIVE_URL to check for in-flight runs"
    exit 0
  fi
else
  log "WARNING: no WORKER_API_KEY in $WORKER_DIR/.env — cannot check for in-flight runs"
fi

# ── Deploy ─────────────────────────────────────────────────────────────────────────────────────
PREV_SHA="$LOCAL_SHA"

git pull --ff-only --quiet origin main \
  || die "git pull is not a fast-forward — the box has local commits or a rewritten history; fix by hand"

NEW_SHA="$(git rev-parse HEAD)"
log "building ${NEW_SHA:0:9}"

cd "$WORKER_DIR"
if ! BUILD_SHA="$(git rev-parse --short HEAD)" docker compose up -d --build; then
  log "build failed for ${NEW_SHA:0:9} — rolling back to ${PREV_SHA:0:9}"
  cd "$REPO_DIR" && git reset --hard --quiet "$PREV_SHA"
  cd "$WORKER_DIR"
  BUILD_SHA="$(git rev-parse --short HEAD)" docker compose up -d --build \
    || die "ROLLBACK ALSO FAILED — the worker may be down. Manual intervention required."
  die "build failed; rolled back to ${PREV_SHA:0:9} and the previous build is running"
fi

# ── Prove it came up, on the commit we asked for ───────────────────────────────────────────────
# Not just "healthy" — healthy AND stamped with the new sha. A container that failed to restart
# keeps answering on the OLD build, and a check that only asks "are you healthy?" reads that as a
# successful deploy. That exact confusion (a stale build faking a green light) cost this project a
# day on 2026-08-30.
WANT_SHA="$(git rev-parse --short HEAD)"
DEADLINE=$(( $(date +%s) + HEALTH_TIMEOUT_SECS ))
HEALTHY=0

# ── THE STATUS WORD DIFFERS BY ENDPOINT, AND THIS ASKED FOR THE WRONG ONE ──────────────────────
#
# This required `"status":"healthy"`. `HEALTH_URL` defaults to **/healthz**, which answers
# `"status":"ok"`. Only the deeper **/health** ever says `"healthy"`.
#
# So the gate could never match, and the failure mode is the worst available: every deploy would
# look unhealthy, every deploy would be rolled back, and the log would report *"rolled back;
# investigate before merging further"* about a build that was fine. An updater that reverts good
# releases and blames them is worse than no updater.
#
# Caught by reading a live `/healthz` — `{"status":"ok","version":"5.1.0","buildSha":"555f43104"}`
# — against the script, rather than by reasoning about either alone. Nothing in the script looked
# wrong on its own; the mismatch existed only between it and the process it polls. That is the same
# shape as the `skipped_work` `{step}` vs `{what}` defect found the same week.
#
# Both words are accepted rather than picking one, so the gate holds whichever endpoint `HEALTH_URL`
# names. `/healthz` is the default because it is what the container's own healthcheck uses; point
# `HEALTH_URL` at `/health` for the deeper gate, which verifies Playwright, R2, Redis and Supabase
# and treats an `unconfigured` vendor as fine rather than as a failure.
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  BODY="$(curl -fsS "$HEALTH_URL" 2>/dev/null || echo '')"
  if printf '%s' "$BODY" | grep -qE '"status"[[:space:]]*:[[:space:]]*"(ok|healthy)"' \
     && printf '%s' "$BODY" | grep -q "\"buildSha\"[[:space:]]*:[[:space:]]*\"$WANT_SHA\""; then
    HEALTHY=1
    break
  fi
  sleep 5
done

if [ "$HEALTHY" -ne 1 ]; then
  log "‼ ${NEW_SHA:0:9} did not report healthy on its own build within ${HEALTH_TIMEOUT_SECS}s"
  log "rolling back to ${PREV_SHA:0:9}"
  cd "$REPO_DIR" && git reset --hard --quiet "$PREV_SHA"
  cd "$WORKER_DIR"
  BUILD_SHA="$(git rev-parse --short HEAD)" docker compose up -d --build \
    || die "ROLLBACK ALSO FAILED — the worker may be down. Manual intervention required."
  die "rolled back to ${PREV_SHA:0:9}; investigate ${NEW_SHA:0:9} before merging further"
fi

log "✓ deployed ${NEW_SHA:0:9} — healthy and serving its own build"
