#!/bin/bash
# worker/harvest.sh — Download all free documents for a property
# Calls POST /research/harvest on the local research worker.
#
# Usage: ./harvest.sh <projectId> <owner> <county> [instrument1,instrument2,...]
#
# Examples:
#   ./harvest.sh ash-001 'ASH FAMILY TRUST' Bell 2010043440,2023032044
#   ./harvest.sh gaines-001 'RK GAINES' Bell
#   ./harvest.sh travis-001 'JOHN SMITH' Travis 2021012345

PROJECT_ID="$1"
OWNER="$2"
COUNTY="$3"
INSTRUMENTS="$4"

if [ -z "$PROJECT_ID" ] || [ -z "$OWNER" ] || [ -z "$COUNTY" ]; then
  echo "Usage: ./harvest.sh <projectId> <owner> <county> [instrument1,instrument2,...]"
  echo ""
  echo "Example:"
  echo "  ./harvest.sh ash-001 'ASH FAMILY TRUST' Bell 2010043440,2023032044"
  exit 1
fi

# Load environment variables (WORKER_API_KEY, ANTHROPIC_API_KEY, etc.)
# shellcheck disable=SC1091
source /root/starr-worker/.env

echo "==================================="
echo "  Starr Document Harvester"
echo "==================================="
echo "Project:  $PROJECT_ID"
echo "Owner:    $OWNER"
echo "County:   $COUNTY"
[ -n "$INSTRUMENTS" ] && echo "Instruments: $INSTRUMENTS"
echo ""

# ── Map county name to FIPS code ──────────────────────────────────────────────
# Add entries here as counties are onboarded.
COUNTY_FIPS="48027"  # Default: Bell County
COUNTY_UPPER=$(echo "$COUNTY" | tr '[:lower:]' '[:upper:]')
case "$COUNTY_UPPER" in
  BELL)        COUNTY_FIPS="48027" ;;
  WILLIAMSON)  COUNTY_FIPS="48491" ;;
  TRAVIS)      COUNTY_FIPS="48453" ;;
  MCLENNAN)    COUNTY_FIPS="48309" ;;
  BEXAR)       COUNTY_FIPS="48029" ;;
  CORYELL)     COUNTY_FIPS="48099" ;;
  FALLS)       COUNTY_FIPS="48145" ;;
  MILAM)       COUNTY_FIPS="48331" ;;
  LAMPASAS)    COUNTY_FIPS="48281" ;;
  DALLAS)      COUNTY_FIPS="48113" ;;
  HARRIS)      COUNTY_FIPS="48201" ;;
  TARRANT)     COUNTY_FIPS="48439" ;;
  *)
    echo "[WARN] Unknown county '$COUNTY' — defaulting FIPS to $COUNTY_FIPS (Bell)"
    echo "       Add your county to harvest.sh FIPS lookup table to fix this."
    ;;
esac
echo "FIPS:     $COUNTY_FIPS"
echo ""

# ── Build deed references JSON ────────────────────────────────────────────────
DEED_REFS="[]"
if [ -n "$INSTRUMENTS" ]; then
  DEED_REFS="["
  IFS=',' read -ra INST_ARRAY <<< "$INSTRUMENTS"
  FIRST=true
  for inst in "${INST_ARRAY[@]}"; do
    inst=$(echo "$inst" | tr -d ' ')   # strip any accidental whitespace
    [ "$FIRST" = false ] && DEED_REFS+=","
    DEED_REFS+="{\"instrumentNumber\":\"$inst\",\"type\":\"deed\"}"
    FIRST=false
  done
  DEED_REFS+="]"
fi

# ── Build request body ────────────────────────────────────────────────────────
BODY=$(cat <<ENDJSON
{
  "projectId": "$PROJECT_ID",
  "propertyId": "",
  "owner": "$OWNER",
  "county": "$COUNTY",
  "countyFIPS": "$COUNTY_FIPS",
  "deedReferences": $DEED_REFS
}
ENDJSON
)

echo "Starting harvest (this may take 3-10 minutes)..."
echo ""

# Fire-and-forget — worker runs async and saves result to filesystem
curl -s -X POST http://localhost:3100/research/harvest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d "$BODY"

echo ""
echo ""
echo "Harvest started. Monitor progress:"
echo "  pm2 logs starr-worker --lines 50"
echo ""
echo "Check completion status:"
echo "  curl -s http://localhost:3100/research/harvest/$PROJECT_ID \\"
echo "    -H \"Authorization: Bearer \$WORKER_API_KEY\" | python3 -m json.tool"
echo ""
echo "View raw result file:"
echo "  cat /tmp/harvest/$PROJECT_ID/harvest_result.json | python3 -m json.tool"
echo ""
echo "List all downloaded images:"
echo "  find /tmp/harvest/$PROJECT_ID -name '*.png' -o -name '*.pdf' | sort"
