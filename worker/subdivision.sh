#!/bin/bash
# subdivision.sh — Phase 4: Analyze entire subdivision
# Takes Phase 3 intelligence output and builds a complete SubdivisionModel
# with every lot's metes and bounds, interior lines, and subdivision-wide validation.
#
# Usage: ./subdivision.sh <projectId>
#
# Prerequisites:
#   - Phase 3 must have been run first (produces property_intelligence.json)
#   - starr-worker must be running on port 3100
#   - .env must be configured at /root/starr-worker/.env or in current directory

set -euo pipefail

PROJECT_ID="${1:-}"
if [ -z "$PROJECT_ID" ]; then
  echo "Usage: ./subdivision.sh <projectId>"
  echo ""
  echo "Runs Phase 4 Subdivision & Plat Intelligence analysis."
  echo "Requires Phase 3 output at /tmp/analysis/<projectId>/property_intelligence.json"
  exit 1
fi

# Load environment variables
if [ -f /root/starr-worker/.env ]; then
  source /root/starr-worker/.env
elif [ -f .env ]; then
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
  echo "Run Phase 3 analysis first."
  echo ""
  echo "Expected pipeline order:"
  echo "  1. ./research.sh \"<address>\" [county]     ← Phase 1: Discovery"
  echo "  2. ./harvest.sh <projectId> <owner> <county> ← Phase 2: Documents"
  echo "  3. (Phase 3: AI Extraction)                   ← produces intelligence JSON"
  echo "  4. ./subdivision.sh <projectId>              ← Phase 4: THIS SCRIPT"
  exit 1
fi

echo "==================================="
echo "  Starr Subdivision Intelligence"
echo "  Phase 4 — Plat Analysis Engine"
echo "==================================="
echo "Project:      $PROJECT_ID"
echo "Intelligence: $INTEL_PATH"
echo ""

# Quick preview of what Phase 3 found
if command -v jq &> /dev/null; then
  SUBDIV_NAME=$(jq -r '.property.subdivisionName // "unknown"' "$INTEL_PATH" 2>/dev/null || echo "unknown")
  LOT_COUNT=$(jq -r '.platAnalysis.lots | length // 0' "$INTEL_PATH" 2>/dev/null || echo "?")
  ACREAGE=$(jq -r '.property.acreage // "?"' "$INTEL_PATH" 2>/dev/null || echo "?")
  echo "Subdivision:  $SUBDIV_NAME"
  echo "Lots found:   $LOT_COUNT"
  echo "Acreage:      $ACREAGE"
  echo ""
fi

echo "Sending to worker..."
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3100/research/subdivision \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"intelligencePath\": \"$INTEL_PATH\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "202" ]; then
  echo "✓ Accepted (HTTP 202)"
  echo "$BODY"
  echo ""
  echo "Subdivision analysis started. This may take 1-3 minutes."
  echo ""
  echo "Monitor progress:"
  echo "  pm2 logs starr-worker"
  echo ""
  echo "Check status:"
  echo "  curl -s -H \"Authorization: Bearer \$WORKER_API_KEY\" \\"
  echo "    http://localhost:3100/research/subdivision/$PROJECT_ID | python3 -m json.tool"
  echo ""
  echo "View results when complete:"
  echo "  cat /tmp/analysis/$PROJECT_ID/subdivision_model.json | python3 -m json.tool"
  echo ""
  echo "Quick summary (after completion):"
  echo "  jq '{status, lots: (.lots | length), reserves: (.reserves | length), "
  echo "    consistency: .subdivisionAnalysis.internalConsistency.status, "
  echo "    errors: (.errors | length)}' /tmp/analysis/$PROJECT_ID/subdivision_model.json"
else
  echo "✗ Error (HTTP $HTTP_CODE)"
  echo "$BODY"
  exit 1
fi
