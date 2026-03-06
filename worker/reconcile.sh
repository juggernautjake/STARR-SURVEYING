#!/bin/bash
# reconcile.sh — Phase 7: Geometric Reconciliation of all sources
# Consumes outputs from Phases 3-6 and produces a single reconciled boundary.
#
# Usage: ./reconcile.sh <projectId>
#
# Prerequisites:
#   - Phase 3 must have been run (produces property_intelligence.json)
#   - Phases 4, 5, 6 are optional but improve reconciliation quality
#   - starr-worker must be running on port 3100

set -euo pipefail

PROJECT_ID="${1:-}"
if [ -z "$PROJECT_ID" ]; then
  echo "Usage: ./reconcile.sh <projectId>"
  echo ""
  echo "Runs Phase 7 Geometric Reconciliation."
  echo "Requires Phase 3 output at /tmp/analysis/<projectId>/property_intelligence.json"
  echo "Optionally uses Phases 4-6 output for multi-source cross-validation."
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

BASE="/tmp/analysis/$PROJECT_ID"

if [ ! -f "$BASE/property_intelligence.json" ]; then
  echo "ERROR: No intelligence file found at $BASE/property_intelligence.json"
  echo "Run Phase 3 analysis first."
  echo ""
  echo "Expected pipeline order:"
  echo "  1. ./research.sh \"<address>\" [county]         ← Phase 1: Discovery"
  echo "  2. ./harvest.sh <projectId> <owner> <county>   ← Phase 2: Documents"
  echo "  3. (Phase 3: AI Extraction)                     ← produces intelligence JSON"
  echo "  4. ./subdivision.sh <projectId>                ← Phase 4: Subdivision (optional)"
  echo "  5. (Phase 5: Adjacent Research)                 ← cross_validation_report.json"
  echo "  6. (Phase 6: TxDOT ROW)                        ← row_data.json"
  echo "  7. ./reconcile.sh <projectId>                  ← Phase 7: THIS SCRIPT"
  exit 1
fi

echo "==================================="
echo "  Starr Geometric Reconciliation"
echo "  Phase 7 — Multi-Source Fusion"
echo "==================================="
echo "Project: $PROJECT_ID"
echo ""

# Build the phasePaths JSON — include available phase outputs
PATHS="{\"intelligence\": \"$BASE/property_intelligence.json\""

if [ -f "$BASE/subdivision_model.json" ]; then
  PATHS="$PATHS, \"subdivision\": \"$BASE/subdivision_model.json\""
  echo "  ✓ Phase 4 subdivision model found"
else
  echo "  · Phase 4 subdivision model not found (skipping)"
fi

if [ -f "$BASE/cross_validation_report.json" ]; then
  PATHS="$PATHS, \"crossValidation\": \"$BASE/cross_validation_report.json\""
  echo "  ✓ Phase 5 cross-validation report found"
else
  echo "  · Phase 5 cross-validation report not found (skipping)"
fi

if [ -f "$BASE/row_data.json" ]; then
  PATHS="$PATHS, \"rowReport\": \"$BASE/row_data.json\""
  echo "  ✓ Phase 6 TxDOT ROW report found"
else
  echo "  · Phase 6 TxDOT ROW report not found (skipping)"
fi

PATHS="$PATHS}"

echo ""
echo "Sending to worker..."
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3100/research/reconcile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"phasePaths\": $PATHS}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "202" ]; then
  echo "✓ Accepted (HTTP 202)"
  echo "$BODY"
  echo ""
  echo "Reconciliation started. This typically completes within 30-60 seconds."
  echo ""
  echo "Monitor progress:"
  echo "  pm2 logs starr-worker"
  echo ""
  echo "Check status:"
  echo "  curl -s -H \"Authorization: Bearer \$WORKER_API_KEY\" \\"
  echo "    http://localhost:3100/research/reconcile/$PROJECT_ID | python3 -m json.tool"
  echo ""
  echo "View results when complete:"
  echo "  cat $BASE/reconciled_boundary.json | python3 -m json.tool"
  echo ""
  echo "Quick summary (after completion):"
  echo "  jq '{status, totalCalls: .reconciledPerimeter.totalCalls,"
  echo "    closureBefore: .closureOptimization.beforeReconciliation,"
  echo "    closureAfter: .closureOptimization.afterCompassRule,"
  echo "    avgConfidence: .reconciledPerimeter.averageConfidence,"
  echo "    prevConfidence: .reconciledPerimeter.previousAverageConfidence,"
  echo "    unresolvedConflicts: (.unresolvedConflicts | length),"
  echo "    errors: (.errors | length)}' $BASE/reconciled_boundary.json"
else
  echo "✗ Error (HTTP $HTTP_CODE)"
  echo "$BODY"
  exit 1
fi
