#!/bin/bash
# worker/research.sh — Quick property research from the droplet console
#
# Usage:
#   ./research.sh "3779 FM 436, Belton, TX 76513"
#   ./research.sh "3779 FM 436, Belton, TX 76513" Bell
#
# Spec §1.8

ADDRESS="$1"
COUNTY="${2:-}"

if [ -z "$ADDRESS" ]; then
  echo "Usage: ./research.sh \"<address>\" [county]"
  echo "Example: ./research.sh \"3779 FM 436, Belton, TX 76513\" Bell"
  exit 1
fi

# Load environment variables (.env must be in the worker root or /root/starr-worker/)
ENV_FILE="$(dirname "$0")/.env"
[ -f "$ENV_FILE" ] && source "$ENV_FILE"
[ -z "$WORKER_API_KEY" ] && [ -f "/root/starr-worker/.env" ] && source /root/starr-worker/.env

if [ -z "$WORKER_API_KEY" ]; then
  echo "ERROR: WORKER_API_KEY not set. Create a .env file in the worker directory."
  exit 1
fi

echo "==================================="
echo "  Starr Property Research v2"
echo "==================================="
echo "Address: $ADDRESS"
[ -n "$COUNTY" ] && echo "County:  $COUNTY"
echo ""
echo "Starting discovery..."
echo ""

# Build JSON body
BODY="{\"address\": \"$ADDRESS\""
[ -n "$COUNTY" ] && BODY="$BODY, \"county\": \"$COUNTY\""
BODY="$BODY}"

RESULT=$(curl -s -X POST http://localhost:3100/research/discover \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d "$BODY")

if [ -z "$RESULT" ]; then
  echo "ERROR: No response from worker. Is it running on port 3100?"
  exit 1
fi

# Pretty-print JSON (prefer jq, fall back to python3)
if command -v jq &>/dev/null; then
  echo "$RESULT" | jq .
elif command -v python3 &>/dev/null; then
  echo "$RESULT" | python3 -m json.tool
else
  echo "$RESULT"
fi

# Save result to /tmp for review
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTFILE="/tmp/discovery_${TIMESTAMP}.json"
echo "$RESULT" > "$OUTFILE"
echo ""
echo "Result saved to $OUTFILE"
