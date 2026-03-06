#!/bin/bash
# worker/analyze.sh — Run Phase 3 AI Document Intelligence on a harvested project.
# Calls POST /research/analyze on the local research worker.
#
# Phase 3 reads the Phase 2 harvest_result.json, routes every document through
# the AI extraction pipelines, and produces property_intelligence.json.
#
# Usage: ./analyze.sh <projectId> [harvestResultPath]
#
# Examples:
#   ./analyze.sh ash-trust-001
#   ./analyze.sh ash-trust-001 /tmp/harvest/ash-trust-001/harvest_result.json

PROJECT_ID="$1"
HARVEST_PATH="${2:-/tmp/harvest/$PROJECT_ID/harvest_result.json}"

if [ -z "$PROJECT_ID" ]; then
  echo "Usage: ./analyze.sh <projectId> [harvestResultPath]"
  echo ""
  echo "Examples:"
  echo "  ./analyze.sh ash-trust-001"
  echo "  ./analyze.sh ash-trust-001 /tmp/harvest/ash-trust-001/harvest_result.json"
  echo ""
  echo "Prerequisites:"
  echo "  1. Phase 1 (discover): ./research.sh ash-trust-001 ..."
  echo "  2. Phase 2 (harvest):  ./harvest.sh ash-trust-001 ..."
  echo "  3. Phase 3 (analyze):  ./analyze.sh ash-trust-001   ← you are here"
  exit 1
fi

# Verify harvest result exists before submitting the job
if [ ! -f "$HARVEST_PATH" ]; then
  echo "[ERROR] Harvest result not found: $HARVEST_PATH"
  echo ""
  echo "Have you run Phase 2 first?"
  echo "  ./harvest.sh $PROJECT_ID 'OWNER NAME' CountyName"
  echo ""
  echo "Or specify the correct path:"
  echo "  ./analyze.sh $PROJECT_ID /tmp/harvest/$PROJECT_ID/harvest_result.json"
  exit 1
fi

# Load environment variables (WORKER_API_KEY, ANTHROPIC_API_KEY, etc.)
# shellcheck disable=SC1091
source /root/starr-worker/.env

# Verify ANTHROPIC_API_KEY is set
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "[ERROR] ANTHROPIC_API_KEY is not set in /root/starr-worker/.env"
  echo "        Phase 3 requires Claude AI access for document extraction."
  exit 1
fi

echo "==================================="
echo "  Starr AI Document Analyzer"
echo "  (Phase 3: AI Intelligence)"
echo "==================================="
echo "Project:  $PROJECT_ID"
echo "Harvest:  $HARVEST_PATH"
echo ""

# Show a quick summary of what's in the harvest result
if command -v python3 &> /dev/null; then
  echo "Harvest summary:"
  python3 -c "
import json, sys
try:
  with open('$HARVEST_PATH') as f:
    d = json.load(f)
  idx = d.get('documentIndex', {})
  docs = d.get('documents', {})
  target = docs.get('target', {})
  print(f\"  Plats:        {len(target.get('plats', []))} document(s)\")
  print(f\"  Deeds:        {len(target.get('deeds', []))} document(s)\")
  print(f\"  Easements:    {len(target.get('easements', []))} document(s)\")
  print(f\"  Restrictions: {len(target.get('restrictions', []))} document(s)\")
  print(f\"  Total pages:  {idx.get('totalPagesDownloaded', 0)}\")
  print(f\"  Est. cost:    \${idx.get('estimatedPurchaseCost', 0):.2f} to purchase all watermarked docs\")
except Exception as e:
  print(f'  (could not parse harvest result: {e})')
" 2>/dev/null
  echo ""
fi

# Fire-and-forget — worker runs async and saves result to filesystem
echo "Starting analysis (3–10 minutes for a typical 6-lot subdivision)..."
echo ""

# Use printf to safely build the JSON body — avoids shell variable injection issues
# if PROJECT_ID or HARVEST_PATH contain special characters (quotes, backslashes, etc.)
# shellcheck disable=SC2059
JSON_BODY=$(printf '{"projectId":"%s","harvestResultPath":"%s"}' \
  "$(printf '%s' "$PROJECT_ID" | sed 's/["\\/]/\\&/g')" \
  "$(printf '%s' "$HARVEST_PATH" | sed 's/["\\/]/\\&/g')")

RESPONSE=$(curl -s -X POST http://localhost:3100/research/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d "$JSON_BODY")

echo "Worker response: $RESPONSE"
echo ""

# Check for errors in the response
if echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get('status') == 'accepted' else 1)" 2>/dev/null; then
  echo "✓ Analysis job accepted successfully."
else
  echo "[WARN] Unexpected response from worker — check PM2 logs for details."
fi

echo ""
echo "Monitor live progress:"
echo "  pm2 logs starr-worker --lines 100"
echo ""
echo "Poll for completion (run repeatedly until you see the full result):"
echo "  curl -s http://localhost:3100/research/analyze/$PROJECT_ID \\"
echo "    -H \"Authorization: Bearer \$WORKER_API_KEY\" | python3 -m json.tool | head -30"
echo ""
echo "Check result file when complete:"
echo "  cat /tmp/analysis/$PROJECT_ID/property_intelligence.json | python3 -m json.tool | head -80"
echo ""
echo "Quick summary of results (after completion):"
echo "  python3 -c \""
echo "import json"
echo "with open('/tmp/analysis/$PROJECT_ID/property_intelligence.json') as f:"
echo "  d = json.load(f)"
echo "p = d.get('property', {})"
echo "c = d.get('confidenceSummary', {})"
echo "print(f\\\"Property: {p.get('name', 'unknown')} ({p.get('propertyType')})\\\") "
echo "print(f\\\"Acreage:  {p.get('totalAcreage', 0):.3f} acres\\\") "
echo "print(f\\\"Lots:     {len(d.get('lots', []))}\\\") "
echo "print(f\\\"Confidence: {c.get('overall', 0)}% — {c.get('rating', 'UNKNOWN')}\\\") "
echo "print(f\\\"Discrepancies: {len(d.get('discrepancies', []))}\\\") "
echo "\""
