#!/bin/bash
# adjacent.sh — Phase 5: Adjacent Property Research & Boundary Cross-Validation
#
# Research all neighboring properties identified in Phase 3/4 and cross-validate
# shared boundary calls against their deeds. Produces cross_validation_report.json.
#
# Usage:
#   ./adjacent.sh <projectId>
#
# Example:
#   ./adjacent.sh ash-trust-001
#
# Prerequisites:
#   - Phase 3 must have run (produces property_intelligence.json)
#   - Phase 4 is optional but recommended (provides adjacency matrix)
#   - starr-worker must be running on port 3100 (pm2 start starr-worker)
#   - ANTHROPIC_API_KEY must be set in .env
#   - npx playwright install chromium (for county clerk navigation)
#
# Output:
#   /tmp/analysis/<projectId>/cross_validation_report.json
#
# Note: Phase 5 can take 10-30 minutes depending on the number of adjacent
#       properties and county clerk response times.

set -euo pipefail

PROJECT_ID="${1:-}"
if [ -z "$PROJECT_ID" ]; then
  echo "Usage: ./adjacent.sh <projectId>"
  echo ""
  echo "Runs Phase 5: Adjacent Property Research & Boundary Cross-Validation."
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
SUB_PATH="/tmp/analysis/$PROJECT_ID/subdivision_model.json"

if [ ! -f "$INTEL_PATH" ]; then
  echo "ERROR: No intelligence file found at $INTEL_PATH"
  echo "Run Phase 3 analysis first:"
  echo "  ./analyze.sh <projectId>"
  exit 1
fi

echo "==========================================="
echo "  Starr Adjacent Property Research"
echo "  Phase 5 — Cross-Validation Engine"
echo "==========================================="
echo "Project:      $PROJECT_ID"
echo "Intelligence: $INTEL_PATH"

if [ -f "$SUB_PATH" ]; then
  echo "Subdivision:  $SUB_PATH"
else
  echo "Subdivision:  (not found — Phase 4 not yet run)"
fi

echo ""

# Quick preview of adjacent owners from Phase 3
if command -v jq &> /dev/null; then
  ADJ_COUNT=$(jq -r '.adjacentProperties | length // 0' "$INTEL_PATH" 2>/dev/null || echo "?")
  echo "Adjacent owners from Phase 3: $ADJ_COUNT"
  if [ "$ADJ_COUNT" != "0" ] && [ "$ADJ_COUNT" != "?" ]; then
    jq -r '.adjacentProperties[]?.ownerName // empty' "$INTEL_PATH" 2>/dev/null | head -5 | while read -r owner; do
      echo "  - $owner"
    done
  fi
  echo ""
fi

echo "Sending to worker..."
echo ""

# Build request body
BODY="{\"projectId\": \"$PROJECT_ID\", \"intelligencePath\": \"$INTEL_PATH\""
if [ -f "$SUB_PATH" ]; then
  BODY="$BODY, \"subdivisionPath\": \"$SUB_PATH\""
fi
BODY="$BODY}"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3100/research/adjacent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d "$BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY_RESP=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "202" ]; then
  echo "✓ Accepted (HTTP 202)"
  echo "$BODY_RESP"
  echo ""
  echo "Adjacent research started. This may take 10-30 minutes."
  echo ""
  echo "Monitor progress:"
  echo "  pm2 logs starr-worker"
  echo ""
  echo "Check status (poll every ~60 seconds):"
  echo "  curl -s -H \"Authorization: Bearer \$WORKER_API_KEY\" \\"
  echo "    http://localhost:3100/research/adjacent/$PROJECT_ID | python3 -m json.tool"
  echo ""
  echo "View results when complete:"
  echo "  cat /tmp/analysis/$PROJECT_ID/cross_validation_report.json | python3 -m json.tool"
  echo ""
  echo "Quick summary (after completion):"
  echo "  jq '{status, totalAdjacent: .crossValidationSummary.totalAdjacentProperties,"
  echo "    researched: .crossValidationSummary.successfullyResearched,"
  echo "    confidence: .crossValidationSummary.overallBoundaryConfidence,"
  echo "    errors: (.errors | length)}' /tmp/analysis/$PROJECT_ID/cross_validation_report.json"
else
  echo "✗ Error (HTTP $HTTP_CODE)"
  echo "$BODY_RESP"
  exit 1
fi
