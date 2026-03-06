#!/bin/bash
# purchase.sh — Phase 9: Document Purchase & Automated Re-Analysis
# Purchases recommended documents and re-analyzes with official images.
#
# Usage: ./purchase.sh <projectId> [budget]
#
# Prerequisites:
#   - Phase 8 must have been run (produces confidence_report.json)
#   - Vendor credentials configured in .env (KOFILE_USERNAME/PASSWORD or TEXASFILE_USERNAME/PASSWORD)
#   - starr-worker must be running on port 3100

set -euo pipefail

PROJECT_ID="${1:-}"
BUDGET="${2:-25.00}"

if [ -z "$PROJECT_ID" ]; then
  echo "Usage: ./purchase.sh <projectId> [budget]"
  echo ""
  echo "Purchases recommended documents and re-analyzes with clean images."
  echo "Requires Phase 8 output at /tmp/analysis/<projectId>/confidence_report.json"
  echo ""
  echo "Options:"
  echo "  projectId  Project identifier (required)"
  echo "  budget     Maximum spend in dollars (default: \$25.00)"
  echo ""
  echo "Required .env variables:"
  echo "  KOFILE_USERNAME / KOFILE_PASSWORD     — for county Kofile systems"
  echo "  TEXASFILE_USERNAME / TEXASFILE_PASSWORD — for statewide TexasFile"
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
CONF_PATH="$BASE/confidence_report.json"

if [ ! -f "$CONF_PATH" ]; then
  echo "ERROR: No confidence report found at $CONF_PATH"
  echo "Run Phase 8 (confidence scoring) first."
  echo ""
  echo "Expected pipeline order:"
  echo "  1. ./research.sh \"<address>\" [county]         ← Phase 1: Discovery"
  echo "  2. ./harvest.sh <projectId> <owner> <county>   ← Phase 2: Documents"
  echo "  3. (Phase 3: AI Extraction)                     ← produces intelligence JSON"
  echo "  4. ./subdivision.sh <projectId>                ← Phase 4: Subdivision"
  echo "  5. (Phase 5: Adjacent Research)                 ← cross_validation_report.json"
  echo "  6. (Phase 6: TxDOT ROW)                        ← row_data.json"
  echo "  7. ./reconcile.sh <projectId>                  ← Phase 7: Reconciliation"
  echo "  8. ./confidence.sh <projectId>                 ← Phase 8: Confidence Scoring"
  echo "  9. ./purchase.sh <projectId> [budget]          ← Phase 9: THIS SCRIPT"
  exit 1
fi

# Check for vendor credentials
if [ -z "${KOFILE_USERNAME:-}" ] && [ -z "${TEXASFILE_USERNAME:-}" ]; then
  echo "ERROR: No vendor credentials configured."
  echo "Set KOFILE_USERNAME/KOFILE_PASSWORD or TEXASFILE_USERNAME/TEXASFILE_PASSWORD in .env"
  exit 1
fi

echo "==================================="
echo "  Starr Document Purchase"
echo "  Phase 9 — Purchase & Re-Analyze"
echo "==================================="
echo "Project: $PROJECT_ID"
echo "Budget:  \$$BUDGET"
echo ""

# Show vendor status
if [ -n "${KOFILE_USERNAME:-}" ]; then
  echo "  ✓ Kofile credentials configured"
else
  echo "  · Kofile credentials not set (skipping)"
fi

if [ -n "${TEXASFILE_USERNAME:-}" ]; then
  echo "  ✓ TexasFile credentials configured"
else
  echo "  · TexasFile credentials not set (skipping)"
fi
echo ""

# Show current confidence and recommended purchases
echo "Current confidence report:"
python3 -c "
import json
with open('$CONF_PATH') as f:
    data = json.load(f)
oc = data.get('overallConfidence', {})
print(f\"  Overall:  {oc.get('score', 'n/a')} ({oc.get('grade', 'n/a')}) — {oc.get('label', '')}\")
sdm = data.get('surveyorDecisionMatrix', {})
print(f\"  Field-ready: {'YES' if sdm.get('readyForField') else 'NO'}\")
print(f\"  Projected after purchase: {sdm.get('afterDocPurchase', 'n/a')}\")
print()
recs = data.get('documentPurchaseRecommendations', [])
if recs:
    print('Recommended purchases:')
    for rec in recs:
        print(f\"  #{rec['priority']}: {rec['documentType']} {rec['instrument']} — {rec['estimatedCost']} (impact: {rec['confidenceImpact']})\")
else:
    print('No documents recommended for purchase.')
" 2>/dev/null || echo "  (Could not parse confidence report)"
echo ""

read -p "Proceed with purchases up to \$$BUDGET? (y/n) " CONFIRM
if [ "$CONFIRM" != "y" ]; then
  echo "Cancelled."
  exit 0
fi

echo ""
echo "Sending to worker..."
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3100/research/purchase \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"confidenceReportPath\": \"$CONF_PATH\", \"budget\": $BUDGET, \"autoReanalyze\": true, \"paymentMethod\": \"account_balance\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "202" ]; then
  echo "✓ Accepted (HTTP 202)"
  echo "$BODY"
  echo ""
  echo "Purchase and re-analysis started. This may take 2-5 minutes."
  echo ""
  echo "Monitor progress:"
  echo "  pm2 logs starr-worker"
  echo ""
  echo "Check status:"
  echo "  curl -s -H \"Authorization: Bearer \$WORKER_API_KEY\" \\"
  echo "    http://localhost:3100/research/purchase/$PROJECT_ID | python3 -m json.tool"
  echo ""
  echo "View purchase report when complete:"
  echo "  cat $BASE/purchase_report.json | python3 -m json.tool"
  echo ""
  echo "Quick summary (after completion):"
  echo "  jq '{status, purchased: [.purchases[] | select(.status==\"purchased\") | .instrument],"
  echo "    totalSpent: .billing.totalCharged,"
  echo "    remainingBudget: .billing.remainingBalance,"
  echo "    callsChanged: [.reanalysis.documentReanalyses[].callsChanged] | add,"
  echo "    confidenceGain: .updatedReconciliation.confidenceGain,"
  echo "    errors: (.errors | length)}' $BASE/purchase_report.json"
  echo ""
  echo "View invoice:"
  echo "  cat /tmp/billing/${PROJECT_ID}_invoice.json | python3 -m json.tool"
else
  echo "✗ Error (HTTP $HTTP_CODE)"
  echo "$BODY"
  exit 1
fi
