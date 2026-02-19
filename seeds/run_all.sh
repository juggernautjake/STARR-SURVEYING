#!/usr/bin/env bash
# ============================================================================
# run_all.sh
# Runs all seed files in order against a Supabase/PostgreSQL database.
#
# Usage:
#   ./seeds/run_all.sh                          # Uses DATABASE_URL from .env
#   ./seeds/run_all.sh --reset                  # Reset + re-seed everything
#   ./seeds/run_all.sh --db "postgresql://..."   # Explicit connection string
#   ./seeds/run_all.sh --dry-run                # Print files without executing
#
# Prerequisites:
#   - psql (PostgreSQL client) installed
#   - Schema + migrations already applied
#   - DATABASE_URL set in environment or .env file
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESET=false
DRY_RUN=false
DB_URL=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --reset)   RESET=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --db)      DB_URL="$2"; shift 2 ;;
    *)         echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Resolve database URL
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

# Define seed file order
SEED_FILES=(
  "001_config.sql"
  "010_curriculum.sql"
  "011_curriculum_blocks.sql"
  "020_acc.sql"
  "021_acc_blocks.sql"
  "030_fs_prep.sql"
  "040_drone.sql"
  "050_srvy.sql"
  "060_articles.sql"
  "070_templates.sql"
  "080_milestones.sql"
)

echo "=== STARR-SURVEYING Database Seeder ==="
echo ""

# Reset if requested
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

# Run each seed file
for file in "${SEED_FILES[@]}"; do
  filepath="$SCRIPT_DIR/$file"
  if [[ -f "$filepath" ]]; then
    echo "[SEED] $file"
    if $DRY_RUN; then
      echo "  (dry-run) Would execute: $filepath"
    else
      psql "$DB_URL" -f "$filepath" --quiet 2>&1 | while IFS= read -r line; do
        echo "  $line"
      done
    fi
  else
    echo "[SKIP] $file (not found)"
  fi
done

echo ""
echo "=== Seeding complete ==="
