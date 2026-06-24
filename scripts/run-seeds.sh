#!/usr/bin/env bash
# scripts/run-seeds.sh
#
# Apply the STARR-SURVEYING database schema by running every numbered seed file
# in seeds/ against your Postgres/Supabase database, in order, with one command —
# instead of pasting ~190 files into the Supabase SQL editor by hand.
#
# The seeds are idempotent (CREATE TABLE IF NOT EXISTS, etc.), so this is safe to
# re-run; already-applied files become no-ops.
#
# ── Usage ───────────────────────────────────────────────────────────────────
#   ./scripts/run-seeds.sh "postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"
#   DATABASE_URL="postgresql://..." ./scripts/run-seeds.sh
#
#   Get the connection string from Supabase → Project Settings → Database →
#   Connection string → URI (use the DIRECT connection / port 5432 for DDL).
#
# ── Flags ───────────────────────────────────────────────────────────────────
#   --dry-run            List the files in the exact order they'd run; do nothing.
#   --yes                Skip the "are you sure" confirmation.
#   --continue-on-error  Keep going past a failing file (default: stop on error).
#   --with-reset         ALSO run 000_reset.sql FIRST. ⚠️ This TRUNCATES every
#                        table (wipes all rows). Excluded by default for safety.
#
# ── Notes ───────────────────────────────────────────────────────────────────
#   * Non-numbered diagnostics (audit_*.sql) are intentionally skipped.
#   * Storage *bucket policies* on storage.objects can't be created from SQL
#     (owned by supabase_admin) — add those in the Supabase dashboard per each
#     bucket seed's comment (message-attachments, lead-attachments, user-files…).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEEDS_DIR="$REPO_ROOT/seeds"

DB_URL="${DATABASE_URL:-}"
DRY_RUN=0
ASSUME_YES=0
CONTINUE_ON_ERROR=0
WITH_RESET=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --continue-on-error) CONTINUE_ON_ERROR=1 ;;
    --with-reset) WITH_RESET=1 ;;
    --help|-h) sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    postgres://*|postgresql://*) DB_URL="$arg" ;;
    *) echo "Unknown argument: $arg (use --help)"; exit 2 ;;
  esac
done

if [ "$DRY_RUN" -eq 0 ] && [ -z "$DB_URL" ]; then
  echo "ERROR: no database connection string. Pass it as an argument or set DATABASE_URL."
  echo "       ./scripts/run-seeds.sh \"postgresql://postgres:PASS@db.PROJECT.supabase.co:5432/postgres\""
  exit 2
fi

if [ "$DRY_RUN" -eq 0 ] && ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found. Install the PostgreSQL client (e.g. 'brew install libpq' or"
  echo "       'apt-get install postgresql-client'), or run the seeds via the Supabase SQL editor."
  exit 2
fi

# Build the ordered file list: numbered seeds only, sorted by numeric prefix then
# name (deterministic for the intentional duplicate-prefix files). Exclude the
# destructive reset unless explicitly opted in.
mapfile -t ORDERED < <(
  cd "$SEEDS_DIR" && ls [0-9]*_*.sql 2>/dev/null \
    | sort -t_ -k1,1n -k2,2 \
    | { if [ "$WITH_RESET" -eq 1 ]; then cat; else grep -v '^000_reset\.sql$' || true; fi; }
)

if [ "${#ORDERED[@]}" -eq 0 ]; then
  echo "ERROR: no seed files found in $SEEDS_DIR"
  exit 1
fi

echo "Seed runner — $SEEDS_DIR"
echo "  files to run : ${#ORDERED[@]}"
echo "  reset (000)  : $([ "$WITH_RESET" -eq 1 ] && echo 'YES — will TRUNCATE all data' || echo 'skipped')"
echo "  on error     : $([ "$CONTINUE_ON_ERROR" -eq 1 ] && echo 'continue' || echo 'stop')"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "  mode         : DRY RUN (listing only)"
  echo "----------------------------------------------------------------------"
  i=0
  for f in "${ORDERED[@]}"; do i=$((i+1)); printf '  %3d. %s\n' "$i" "$f"; done
  exit 0
fi

# Show the target host (without leaking the password) and confirm.
HOST_HINT="$(printf '%s' "$DB_URL" | sed -E 's#^[a-z]+://[^@]*@##; s#/.*$##')"
echo "  target       : $HOST_HINT"
echo "----------------------------------------------------------------------"
if [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "Run these ${#ORDERED[@]} seed files against $HOST_HINT? [y/N] " ans
  case "$ans" in y|Y|yes|YES) ;; *) echo "Aborted."; exit 0 ;; esac
fi

# Quieten idempotent NOTICE chatter; still surface warnings + errors.
export PGOPTIONS='--client-min-messages=warning'

fail=0; ok=0; i=0
for f in "${ORDERED[@]}"; do
  i=$((i+1))
  printf '[%3d/%3d] %s ... ' "$i" "${#ORDERED[@]}" "$f"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$SEEDS_DIR/$f" >/tmp/seed-run.$$.log 2>&1; then
    echo "ok"; ok=$((ok+1))
  else
    echo "FAILED"
    echo "------ error output ($f) ------"
    cat /tmp/seed-run.$$.log
    echo "-------------------------------"
    fail=$((fail+1))
    if [ "$CONTINUE_ON_ERROR" -ne 1 ]; then
      rm -f /tmp/seed-run.$$.log
      echo ""
      echo "Stopped on first failure. Fix the file above and re-run — already-applied"
      echo "files are idempotent and will be skipped. (Use --continue-on-error to push past.)"
      exit 1
    fi
  fi
done
rm -f /tmp/seed-run.$$.log

echo "----------------------------------------------------------------------"
echo "Done. $ok applied, $fail failed."
echo ""
echo "Next: in the Supabase dashboard, add the service-role storage policies for"
echo "each bucket (see the comments in seeds/318, 380, etc.). Then deploy the web"
echo "app per docs/VERCEL_ENV_CHECKLIST.md."
[ "$fail" -eq 0 ]
