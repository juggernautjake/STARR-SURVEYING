#!/bin/bash
# row.sh — Phase 6: TxDOT ROW & Public Infrastructure Integration
#
# Queries TxDOT ArcGIS REST API for Right-of-Way data for every road
# identified in Phase 3 property intelligence. Resolves road boundary
# discrepancies (deed-says-straight vs plat-says-curved) using TxDOT
# authoritative geometry.
#
# Usage:
#   ./row.sh <projectId>
#
# Example:
#   ./row.sh ash-trust-001
#
# Prerequisites:
#   - Phase 3 must have run (produces property_intelligence.json)
#   - starr-worker must be running on port 3100 (pm2 start starr-worker)
#   - ANTHROPIC_API_KEY must be set in .env (for AI conflict resolution)
#   - npx playwright install chromium (for RPAM fallback, if needed)
#
# Output:
#   /tmp/analysis/<projectId>/row_data.json
#
# Note: Phase 6 typically completes in 2-10 minutes depending on the number
#       of roads, TxDOT ArcGIS response times, and whether RPAM fallback
#       is triggered.

set -euo pipefail

PROJECT_ID="${1:-}"
if [ -z "$PROJECT_ID" ]; then
  echo "Usage: ./row.sh <projectId>"
  echo ""
  echo "Runs Phase 6: TxDOT ROW & Public Infrastructure Integration."
  echo "Requires Phase 3 output at /tmp/analysis/<projectId>/property_intelligence.json"
  exit 1
fi

# ── Load environment variables ────────────────────────────────────────────────
if [ -f /root/starr-worker/.env ]; then
  # shellcheck disable=SC1091
  source /root/starr-worker/.env
elif [ -f .env ]; then
  # shellcheck disable=SC1091
  source .env
else
  echo "WARNING: No .env file found — using existing environment"
fi

if [ -z "${WORKER_API_KEY:-}" ]; then
  echo "ERROR: WORKER_API_KEY not set"
  exit 1
fi

INTEL_PATH="/tmp/analysis/$PROJECT_ID/property_intelligence.json"

if [ ! -f "$INTEL_PATH" ]; then
  echo "ERROR: No intelligence file found at $INTEL_PATH"
  echo "Run Phase 3 analysis first:"
  echo "  ./analyze.sh $PROJECT_ID"
  exit 1
fi

echo "==========================================="
echo "  Starr TxDOT ROW Integration"
echo "  Phase 6 — Road Boundary Resolution"
echo "==========================================="
echo "Project:      $PROJECT_ID"
echo "Intelligence: $INTEL_PATH"
echo ""

# ── Preview roads from Phase 3 ───────────────────────────────────────────────
if command -v jq &> /dev/null; then
  ROAD_COUNT=$(jq -r '.roads | length // 0' "$INTEL_PATH" 2>/dev/null || echo "?")
  echo "Roads from Phase 3: $ROAD_COUNT"
  if [ "$ROAD_COUNT" != "0" ] && [ "$ROAD_COUNT" != "?" ]; then
    jq -r '.roads[]?.name // empty' "$INTEL_PATH" 2>/dev/null | head -10 | while read -r road; do
      echo "  - $road"
    done
  fi
  echo ""

  # Check if there are road-related discrepancies
  ROAD_DISC=$(jq -r '[.discrepancies[]? | select(.category == "road_geometry")] | length // 0' "$INTEL_PATH" 2>/dev/null || echo "0")
  if [ "$ROAD_DISC" != "0" ]; then
    echo "Road-geometry discrepancies to resolve: $ROAD_DISC"
    echo ""
  fi
fi

echo "Sending to worker..."
echo ""

# ── Build request body ─────────────────────────────────────────────────────────
BODY="{\"projectId\": \"$PROJECT_ID\", \"intelligencePath\": \"$INTEL_PATH\"}"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3100/research/row \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d "$BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY_RESP=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "202" ]; then
  echo "✓ Accepted (HTTP 202)"
  echo "$BODY_RESP"
  echo ""
  echo "TxDOT ROW integration started. Usually completes in 2-10 minutes."
  echo ""
  echo "Monitor progress:"
  echo "  pm2 logs starr-worker"
  echo ""
  echo "Check status (poll every ~30 seconds):"
  echo "  curl -s -H \"Authorization: Bearer \$WORKER_API_KEY\" \\"
  echo "    http://localhost:3100/research/row/$PROJECT_ID | python3 -m json.tool"
  echo ""
  echo "View results when complete:"
  echo "  cat /tmp/analysis/$PROJECT_ID/row_data.json | python3 -m json.tool"
  echo ""
  echo "Quick summary (after completion):"
  echo "  jq '{status, roads: [.roads[]? | {name, type, rowWidth: .rowData.rowWidth,\\"
  echo "    boundaryType: .rowData.boundaryType, txdotConfirms: .propertyBoundaryResolution.txdotConfirms}],\\"
  echo "    resolved: (.resolvedDiscrepancies | length),\\"
  echo "    errors: (.errors | length)}' /tmp/analysis/$PROJECT_ID/row_data.json"
elif [ "$HTTP_CODE" = "400" ]; then
  echo "✗ Bad request (HTTP 400)"
  echo "$BODY_RESP"
  echo ""
  echo "Make sure Phase 3 has run first: ./analyze.sh $PROJECT_ID"
  exit 1
elif [ "$HTTP_CODE" = "409" ]; then
  echo "⚠ Phase 6 already running for $PROJECT_ID"
  echo "$BODY_RESP"
  echo ""
  echo "Check status:"
  echo "  curl -s -H \"Authorization: Bearer \$WORKER_API_KEY\" \\"
  echo "    http://localhost:3100/research/row/$PROJECT_ID | python3 -m json.tool"
else
  echo "✗ Error (HTTP $HTTP_CODE)"
  echo "$BODY_RESP"
  exit 1
fi
