#!/usr/bin/env bash
# worker/report.sh — Phase 10: Report Generation & Pipeline CLI
# Interactive wrapper around the STARR RECON pipeline and report generator.
#
# Usage:
#   ./report.sh run   "123 Main St, Belton, TX"   [county]
#   ./report.sh report <projectId>
#   ./report.sh status <projectId>
#   ./report.sh list
#   ./report.sh clean  <projectId>

set -euo pipefail

API_URL="${WORKER_URL:-http://localhost:3100}"
API_KEY="${WORKER_API_KEY:-}"
OUTPUT_DIR="${REPORT_OUTPUT_DIR:-/tmp/deliverables}"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ── Helpers ──────────────────────────────────────────────────────────────────

print_header() {
  echo -e "${BOLD}${BLUE}"
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║       STARR RECON — Report & Pipeline CLI            ║"
  echo "║       Phase 10: Production Reports                   ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

api_call() {
  local method="$1"
  local endpoint="$2"
  shift 2
  local extra_args=("$@")

  local auth_header=""
  if [[ -n "$API_KEY" ]]; then
    auth_header="-H \"Authorization: Bearer $API_KEY\""
  fi

  if [[ "$method" == "GET" ]]; then
    eval curl -s "$auth_header" "${API_URL}${endpoint}" "${extra_args[@]:-}"
  else
    eval curl -s -X POST "$auth_header" -H "'Content-Type: application/json'" "${extra_args[@]:-}" "${API_URL}${endpoint}"
  fi
}

check_health() {
  local health
  health=$(curl -s --max-time 5 "${API_URL}/health" 2>/dev/null || echo "")
  if [[ -z "$health" ]]; then
    echo -e "${RED}Error: Worker API not reachable at ${API_URL}${NC}"
    echo "Start the worker with: cd worker && npm start"
    exit 1
  fi
}

# ── Commands ─────────────────────────────────────────────────────────────────

cmd_run() {
  local address="${1:-}"
  local county="${2:-}"

  if [[ -z "$address" ]]; then
    echo -e "${RED}Usage: $0 run \"<address>\" [county]${NC}"
    exit 1
  fi

  print_header
  check_health

  echo -e "${CYAN}Address:${NC} $address"
  [[ -n "$county" ]] && echo -e "${CYAN}County:${NC}  $county"
  echo -e "${CYAN}Output:${NC}  $OUTPUT_DIR"
  echo ""

  # Prompt for options
  echo -e "${BOLD}Report formats:${NC}"
  echo "  1) PDF + DXF + SVG (default)"
  echo "  2) PDF only"
  echo "  3) All formats (PDF, DXF, SVG, PNG, JSON, TXT)"
  echo "  4) Custom"
  read -rp "Select [1]: " fmt_choice
  fmt_choice="${fmt_choice:-1}"

  local formats
  case "$fmt_choice" in
    1) formats='["pdf","dxf","svg"]' ;;
    2) formats='["pdf"]' ;;
    3) formats='["pdf","dxf","svg","png","json","txt"]' ;;
    4)
      read -rp "Enter formats (comma-separated): " custom_fmt
      formats="[$(echo "$custom_fmt" | sed 's/[[:space:]]//g' | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/' )]"
      ;;
    *) formats='["pdf","dxf","svg"]' ;;
  esac

  read -rp "Purchase budget [\$50]: " budget
  budget="${budget:-50}"

  read -rp "Auto-approve purchases? [y/N]: " auto_purchase
  local auto_purchase_bool="false"
  [[ "$auto_purchase" =~ ^[Yy] ]] && auto_purchase_bool="true"

  echo ""
  echo -e "${YELLOW}Starting pipeline...${NC}"

  local body
  body=$(cat <<EOF
{
  "address": "$address",
  $([ -n "$county" ] && echo "\"county\": \"$county\",")
  "budget": $budget,
  "autoPurchase": $auto_purchase_bool,
  "formats": $formats,
  "outputDir": "$OUTPUT_DIR"
}
EOF
)

  local response
  response=$(api_call POST "/research/run" -d "'$body'")

  local project_id
  project_id=$(echo "$response" | grep -o '"projectId":"[^"]*"' | cut -d'"' -f4)

  if [[ -z "$project_id" ]]; then
    echo -e "${RED}Failed to start pipeline:${NC}"
    echo "$response"
    exit 1
  fi

  echo -e "${GREEN}Pipeline started: ${BOLD}$project_id${NC}"
  echo ""

  # Poll for completion
  echo -e "${CYAN}Monitoring progress...${NC}"
  local status="in_progress"
  local last_phases=""

  while [[ "$status" == "in_progress" || "$status" == "accepted" ]]; do
    sleep 5
    local status_response
    status_response=$(api_call GET "/research/run/$project_id")

    status=$(echo "$status_response" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    local phases
    phases=$(echo "$status_response" | grep -o '"completedPhases":\[[^]]*\]' | head -1)

    if [[ "$phases" != "$last_phases" && -n "$phases" ]]; then
      echo -e "  Completed phases: ${GREEN}$phases${NC}"
      last_phases="$phases"
    fi

    printf "."
  done

  echo ""

  if [[ "$status" == "completed" ]]; then
    echo -e "${GREEN}${BOLD}Pipeline complete!${NC}"
    echo ""
    cmd_status "$project_id"
  else
    echo -e "${RED}Pipeline failed. Check logs for details.${NC}"
  fi
}

cmd_report() {
  local project_id="${1:-}"

  if [[ -z "$project_id" ]]; then
    echo -e "${RED}Usage: $0 report <projectId>${NC}"
    exit 1
  fi

  print_header
  check_health

  echo -e "${CYAN}Generating reports for:${NC} $project_id"

  local body
  body=$(cat <<EOF
{
  "projectId": "$project_id",
  "formats": ["pdf", "dxf", "svg", "png", "txt"],
  "outputDir": "$OUTPUT_DIR/$project_id"
}
EOF
)

  local response
  response=$(api_call POST "/research/report" -d "'$body'")

  local status
  status=$(echo "$response" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [[ "$status" == "completed" ]]; then
    echo -e "${GREEN}Reports generated successfully!${NC}"
    echo ""
    echo -e "${BOLD}Deliverables:${NC}"
    echo "$response" | python3 -m json.tool 2>/dev/null | grep -E '"(pdf|dxf|svg|png|json|txt)"' | while read -r line; do
      echo -e "  ${CYAN}$line${NC}"
    done
  else
    echo -e "${RED}Report generation failed:${NC}"
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
  fi
}

cmd_status() {
  local project_id="${1:-}"

  if [[ -z "$project_id" ]]; then
    echo -e "${RED}Usage: $0 status <projectId>${NC}"
    exit 1
  fi

  check_health

  local response
  response=$(api_call GET "/research/deliverables/$project_id")

  local error
  error=$(echo "$response" | grep -o '"error"' || true)

  if [[ -n "$error" ]]; then
    echo -e "${YELLOW}No deliverables found for $project_id${NC}"

    # Check pipeline status
    local pipeline_status
    pipeline_status=$(api_call GET "/research/run/$project_id")
    echo "$pipeline_status" | python3 -m json.tool 2>/dev/null || echo "$pipeline_status"
  else
    echo -e "${GREEN}${BOLD}Project: $project_id${NC}"
    echo ""
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
  fi
}

cmd_list() {
  print_header
  check_health

  echo -e "${BOLD}Projects in /tmp/analysis:${NC}"
  echo ""

  if [[ -d /tmp/analysis ]]; then
    for dir in /tmp/analysis/*/; do
      if [[ -d "$dir" ]]; then
        local name
        name=$(basename "$dir")
        local manifest="$dir${name}_manifest.json"

        if [[ -f "$manifest" ]]; then
          local confidence
          confidence=$(grep -o '"overallConfidence":[0-9]*' "$manifest" | head -1 | cut -d: -f2)
          local grade
          grade=$(grep -o '"overallGrade":"[^"]*"' "$manifest" | head -1 | cut -d'"' -f4)
          echo -e "  ${GREEN}●${NC} $name  [${confidence:-?}% Grade ${grade:-?}]"
        elif [[ -f "${dir}.checkpoint.json" ]]; then
          echo -e "  ${YELLOW}◐${NC} $name  [in progress]"
        else
          echo -e "  ${CYAN}○${NC} $name"
        fi
      fi
    done
  else
    echo "  (no projects found)"
  fi
  echo ""
}

cmd_clean() {
  local project_id="${1:-}"

  if [[ -z "$project_id" ]]; then
    echo -e "${RED}Usage: $0 clean <projectId>${NC}"
    exit 1
  fi

  echo -e "${YELLOW}This will delete all data for project ${BOLD}$project_id${NC}"
  read -rp "Are you sure? [y/N]: " confirm

  if [[ "$confirm" =~ ^[Yy] ]]; then
    rm -rf "/tmp/analysis/$project_id"
    rm -rf "/tmp/deliverables/$project_id"
    rm -f "/tmp/billing/${project_id}.json"
    rm -f "/tmp/billing/${project_id}_invoice.json"
    echo -e "${GREEN}Project $project_id cleaned.${NC}"
  else
    echo "Cancelled."
  fi
}

# ── Main ─────────────────────────────────────────────────────────────────────

cmd="${1:-help}"
shift || true

case "$cmd" in
  run)    cmd_run "$@" ;;
  report) cmd_report "$@" ;;
  status) cmd_status "$@" ;;
  list)   cmd_list ;;
  clean)  cmd_clean "$@" ;;
  help|--help|-h)
    print_header
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  run    <address> [county]   Run full 9-phase pipeline"
    echo "  report <projectId>          Generate reports from existing data"
    echo "  status <projectId>          Check project status"
    echo "  list                        List all projects"
    echo "  clean  <projectId>          Delete project data"
    echo ""
    echo "Environment:"
    echo "  WORKER_URL         Worker API URL (default: http://localhost:3100)"
    echo "  WORKER_API_KEY     API authentication key"
    echo "  REPORT_OUTPUT_DIR  Output directory (default: /tmp/deliverables)"
    echo ""
    ;;
  *)
    echo -e "${RED}Unknown command: $cmd${NC}"
    echo "Run '$0 help' for usage."
    exit 1
    ;;
esac
