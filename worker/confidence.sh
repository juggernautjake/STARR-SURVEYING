#!/bin/bash
# confidence.sh — Phase 8: Confidence Scoring & Discrepancy Intelligence
# Consumes Phase 7 reconciled boundary and produces a comprehensive
# confidence report with discrepancy analysis and purchase recommendations.
#
# Usage: ./confidence.sh <projectId>
#
# Prerequisites:
#   - Phase 7 must have been run (produces reconciled_boundary.json)
#   - starr-worker must be running on port 3100

set -euo pipefail

PROJECT_ID="${1:-}"
if [ -z "$PROJECT_ID" ]; then
  echo "Usage: ./confidence.sh <projectId>"
  echo ""
  echo "Runs Phase 8 Confidence Scoring & Discrepancy Intelligence."
  echo "Requires Phase 7 output at /tmp/analysis/<projectId>/reconciled_boundary.json"
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
RECON_PATH="$BASE/reconciled_boundary.json"

if [ ! -f "$RECON_PATH" ]; then
  echo "ERROR: No reconciled boundary file found at $RECON_PATH"
  echo "Run Phase 7 (reconciliation) first."
  echo ""
  echo "Expected pipeline order:"
  echo "  1. ./research.sh \"<address>\" [county]         ← Phase 1: Discovery"
  echo "  2. ./harvest.sh <projectId> <owner> <county>   ← Phase 2: Documents"
  echo "  3. (Phase 3: AI Extraction)                     ← intelligence JSON"
  echo "  4. ./subdivision.sh <projectId>                ← Phase 4: Subdivision"
  echo "  5. (Phase 5: Adjacent Research)                 ← cross-validation"
  echo "  6. (Phase 6: TxDOT ROW)                        ← ROW report"
  echo "  7. ./reconcile.sh <projectId>                  ← Phase 7: Reconciliation"
  echo "  8. ./confidence.sh <projectId>                 ← Phase 8: THIS SCRIPT"
  exit 1
fi

echo "==================================="
echo "  Starr Confidence Scoring"
echo "  Phase 8 — Discrepancy Intelligence"
echo "==================================="
echo "Project: $PROJECT_ID"
echo ""

# Quick preview of reconciled data
if command -v jq &> /dev/null; then
  TOTAL_CALLS=$(jq -r '.reconciledPerimeter.totalCalls // 0' "$RECON_PATH" 2>/dev/null || echo "?")
  CLOSURE=$(jq -r '.closureOptimization.afterCompassRule // "?"' "$RECON_PATH" 2>/dev/null || echo "?")
  AVG_CONF=$(jq -r '.reconciledPerimeter.averageConfidence // "?"' "$RECON_PATH" 2>/dev/null || echo "?")
  echo "Reconciled calls: $TOTAL_CALLS"
  echo "Closure ratio:    $CLOSURE"
  echo "Avg confidence:   $AVG_CONF%"
  echo ""
fi

echo "Sending to worker..."
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3100/research/confidence \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"reconciledPath\": \"$RECON_PATH\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "202" ]; then
  echo "✓ Accepted (HTTP 202)"
  echo "$BODY"
  echo ""
  echo "Confidence scoring started. Typically completes within 30 seconds."
  echo ""
  echo "Monitor progress:"
  echo "  pm2 logs starr-worker"
  echo ""
  echo "Check status:"
  echo "  curl -s -H \"Authorization: Bearer \$WORKER_API_KEY\" \\"
  echo "    http://localhost:3100/research/confidence/$PROJECT_ID | python3 -m json.tool"
  echo ""
  echo "View results when complete:"
  echo "  cat $BASE/confidence_report.json | python3 -m json.tool"
  echo ""
  echo "Quick summary (after completion):"
  echo "  jq '{overall: .overallConfidence,"
  echo "    discrepancies: .discrepancySummary,"
  echo "    readyForField: .surveyorDecisionMatrix.readyForField,"
  echo "    afterDocPurchase: .surveyorDecisionMatrix.afterDocPurchase,"
  echo "    purchases: [.documentPurchaseRecommendations[] | {type: .documentType, roi, priority}]"
  echo "  }' $BASE/confidence_report.json"
else
  echo "✗ Error (HTTP $HTTP_CODE)"
  echo "$BODY"
  exit 1
fi
