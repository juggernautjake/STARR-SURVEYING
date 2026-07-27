#!/usr/bin/env bash
# .claude/hooks/continue-until-planning-done.sh
#
# Stop hook that auto-continues the conversation through two phases,
# then exits cleanly:
#
#   Phase 1 — Planning. While docs/planning/in-progress/ contains
#   any *.md files, force Claude to keep shipping slices. Claude is
#   responsible for moving each doc to docs/planning/completed/ once
#   its action items are all shipped or explicitly deferred, per the
#   rubric in docs/planning/README.md.
#
#   Phase 2 — QA. Once in-progress/ is empty, gate on
#   docs/planning/QA_CHECKLIST.md. Force continuation while any
#   `- [ ]` checkbox remains; Claude flips each to `[x]` only after
#   genuinely resolving the item.
#
#   Phase 3 — Done. Both empty → exit 0 cleanly so the session can
#   stop normally.
#
# Manual escape: Stop hooks DO NOT fire on Ctrl+C / Esc / explicit
# user interrupt. Press Ctrl+C any time to break the loop.
#
# We intentionally do NOT short-circuit on stop_hook_active. The
# loop's whole job is to continue across multiple natural stops;
# the only stop condition is the filesystem state above. If the
# model gets stuck and can't make progress, use Ctrl+C.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IN_PROGRESS="$REPO_ROOT/docs/planning/in-progress"
QA_CHECKLIST="$REPO_ROOT/docs/planning/QA_CHECKLIST.md"

# Drain stdin (the hook input JSON) so we don't leave a half-read
# pipe — we don't actually need any field from it right now.
cat >/dev/null

# Portable JSON-string emitter. The original hook used `jq`, which is NOT
# installed in every environment (notably Git Bash on Windows) — when it's
# missing the hook errored ("jq: command not found"), emitted nothing, and
# the whole auto-continue loop silently no-op'd. Prefer node (always present
# in this repo's toolchain); fall back to a pure-bash escaper. Prints the
# value as a quoted, escaped JSON string.
json_string() {
  if command -v node >/dev/null 2>&1; then
    RAW="$1" node -e 'process.stdout.write(JSON.stringify(process.env.RAW))'
  else
    local s=$1
    s=${s//\\/\\\\}
    s=${s//\"/\\\"}
    s=${s//$'\n'/\\n}
    s=${s//$'\r'/\\r}
    s=${s//$'\t'/\\t}
    printf '"%s"' "$s"
  fi
}

# A doc is ACTIONABLE unless it carries an explicit blocked marker on a line of its own:
#
#   <!-- HOOK:BLOCKED reason goes here -->
#
# The marker exists for one situation: every remaining item in the doc needs a decision or
# data only the owner has, so no slice can honestly be shipped. Without it the loop has no
# exit but Ctrl+C, and the model is pushed to either invent work or falsely mark things
# deferred — both worse than stopping.
#
# It is deliberately awkward to abuse:
#   · it lives in the doc, in version control, visible in review and in `git blame`;
#   · it must carry a reason on the same line (a bare marker does not count);
#   · it is per-doc, so one blocked doc never silences the others;
#   · deleting the line — or the owner answering — resumes the loop with no other change.
blocked_docs=()
actionable_docs=0
if [ -d "$IN_PROGRESS" ]; then
  while IFS= read -r doc; do
    [ -n "$doc" ] || continue
    # Marker must have at least one non-space character of reason after it.
    if grep -qE '<!--[[:space:]]*HOOK:BLOCKED[[:space:]]+[^[:space:]-]' "$doc" 2>/dev/null; then
      blocked_docs+=("$(basename "$doc")")
    else
      actionable_docs=$((actionable_docs + 1))
    fi
  done < <(find "$IN_PROGRESS" -type f -name "*.md" 2>/dev/null)
fi
remaining_planning_docs=$actionable_docs

remaining_qa_items=0
if [ -f "$QA_CHECKLIST" ]; then
  remaining_qa_items=$(grep -cE '^\s*- \[ \]' "$QA_CHECKLIST" 2>/dev/null) || remaining_qa_items=0
fi

if [ "$remaining_planning_docs" -gt 0 ]; then
  reason="${remaining_planning_docs} planning doc(s) still in docs/planning/in-progress/. Pick the next one (alphabetical filename order works), read it together with the live state of the code it describes, then ship the smallest meaningful next slice — typecheck + lint, commit, push. Annotate the doc with the slice's completion note. When every action item in a doc is shipped or explicitly deferred with a one-line rationale, MOVE the doc from docs/planning/in-progress/ to docs/planning/completed/ per the rubric in docs/planning/README.md. Do not mark items deferred just to empty the folder; defer only when implementation cost clearly exceeds value, and document the reason inline. Once in-progress/ is empty this hook will route the conversation into the QA phase."
  printf '{"decision":"block","reason":%s}\n' "$(json_string "$reason")"
  exit 0
fi

# Every remaining planning doc is explicitly blocked. Stop cleanly rather than fall through
# into the QA phase — QA is the stage AFTER planning finishes, and blocked is not finished.
# Naming the docs keeps the state visible instead of looking like the loop simply ended.
if [ ${#blocked_docs[@]} -gt 0 ]; then
  msg="Auto-continue paused. Every planning doc left in docs/planning/in-progress/ is marked <!-- HOOK:BLOCKED --> with a reason: ${blocked_docs[*]}. Nothing can be shipped without a decision or data from you. Remove the marker from a doc (or answer what it is waiting on) and the loop resumes automatically on the next stop."
  printf '{"systemMessage":%s}\n' "$(json_string "$msg")"
  exit 0
fi

if [ "$remaining_qa_items" -gt 0 ]; then
  reason="All planning docs shipped. ${remaining_qa_items} QA item(s) still open in docs/planning/QA_CHECKLIST.md. Pick the next unchecked item, do the actual work it names (verify functionality, fix the UX, flesh out the missing page, etc.), run the relevant checks, commit + push. Flip the checkbox to [x] only when the item is genuinely resolved — not just touched. When every \`- [ ]\` is \`- [x]\` the session will stop on the next turn."
  printf '{"decision":"block","reason":%s}\n' "$(json_string "$reason")"
  exit 0
fi

printf '{"systemMessage":%s}\n' "$(json_string "docs/planning/in-progress/ + QA_CHECKLIST.md both empty — auto-continue loop finished. Session can stop.")"
exit 0
