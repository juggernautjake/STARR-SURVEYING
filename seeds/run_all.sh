#!/usr/bin/env bash
# ============================================================================
# run_all.sh
# Runs every numbered seed file in order against a Supabase/PostgreSQL DB.
#
# Discovery is automatic: any file matching `seeds/[0-9][0-9][0-9]_*.sql` is
# picked up and executed in lexicographic (= numeric) order. No manual list
# to keep in sync — adding a new migration is just a new file in seeds/.
#
# 000_reset.sql is reserved for the destructive truncate; only runs when
# --reset is passed. Files in scripts/ (verification queries, ad-hoc tools)
# are NOT executed by this script.
#
# Usage:
#   ./seeds/run_all.sh                          # Apply all migrations to DATABASE_URL
#   ./seeds/run_all.sh --reset                  # Truncate everything first, then re-seed
#   ./seeds/run_all.sh --db "postgresql://..."  # Explicit connection string
#   ./seeds/run_all.sh --dry-run                # Print files without executing
#   ./seeds/run_all.sh --from 200               # Start at the file with prefix >= 200
#   ./seeds/run_all.sh --to 099                 # Stop after the last file with prefix <= 099
#
# Prerequisites:
#   - psql (PostgreSQL client) installed
#   - DATABASE_URL set in environment, or in a project-root .env / .env.local
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESET=false
DRY_RUN=false
DB_URL=""
FROM_PREFIX=""
TO_PREFIX=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --reset)   RESET=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --db)      DB_URL="$2"; shift 2 ;;
    --from)    FROM_PREFIX="$2"; shift 2 ;;
    --to)      TO_PREFIX="$2"; shift 2 ;;
    *)         echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Resolve database URL from CLI > env > .env > .env.local
if [[ -z "$DB_URL" ]]; then
  if [[ -n "${DATABASE_URL:-}" ]]; then
    DB_URL="$DATABASE_URL"
  elif [[ -f "$SCRIPT_DIR/../.env" ]]; then
    DB_URL=$(grep -E '^DATABASE_URL=' "$SCRIPT_DIR/../.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  elif [[ -f "$SCRIPT_DIR/../.env.local" ]]; then
    DB_URL=$(grep -E '^DATABASE_URL=' "$SCRIPT_DIR/../.env.local" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  fi
fi

if [[ -z "$DB_URL" ]]; then
  echo "ERROR: No database URL found."
  echo "Set DATABASE_URL in .env or pass --db 'postgresql://...'"
  exit 1
fi

echo "=== STARR-SURVEYING Database Seeder ==="
echo ""

# Reset if requested (000_reset.sql is the only file that runs unconditionally)
if $RESET; then
  echo "[RESET] Running 000_reset.sql..."
  if $DRY_RUN; then
    echo "  (dry-run) Would execute: $SCRIPT_DIR/000_reset.sql"
  else
    psql "$DB_URL" -f "$SCRIPT_DIR/000_reset.sql" --quiet
    echo "  Done. All tables truncated."
  fi
  echo ""
fi

# Discover all numbered seed files (skips 000_*; that's the reset file)
shopt -s nullglob
SEED_FILES=("$SCRIPT_DIR"/[0-9][0-9][0-9]_*.sql)
shopt -u nullglob

if [[ ${#SEED_FILES[@]} -eq 0 ]]; then
  echo "ERROR: No seed files found in $SCRIPT_DIR"
  exit 1
fi

# Apply each file in lexicographic order, honoring --from / --to bounds.
for filepath in "${SEED_FILES[@]}"; do
  basename="$(basename "$filepath")"
  prefix="${basename:0:3}"

  # Always skip 000 — that's the reset file, only runs when --reset is set
  [[ "$prefix" == "000" ]] && continue

  # Honor --from lower bound
  if [[ -n "$FROM_PREFIX" && "$prefix" < "$FROM_PREFIX" ]]; then
    continue
  fi
  # Honor --to upper bound
  if [[ -n "$TO_PREFIX" && "$prefix" > "$TO_PREFIX" ]]; then
    continue
  fi

  echo "[SEED] $basename"
  if $DRY_RUN; then
    echo "  (dry-run) Would execute: $filepath"
  else
    psql "$DB_URL" -f "$filepath" --quiet 2>&1 | while IFS= read -r line; do
      echo "  $line"
    done
  fi
done

echo ""
echo "=== Seeding complete ==="
