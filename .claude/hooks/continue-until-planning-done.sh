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

remaining_planning_docs=0
if [ -d "$IN_PROGRESS" ]; then
  remaining_planning_docs=$(find "$IN_PROGRESS" -type f -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
fi

remaining_qa_items=0
if [ -f "$QA_CHECKLIST" ]; then
  remaining_qa_items=$(grep -cE '^\s*- \[ \]' "$QA_CHECKLIST" 2>/dev/null) || remaining_qa_items=0
fi

if [ "$remaining_planning_docs" -gt 0 ]; then
  reason="${remaining_planning_docs} planning doc(s) still in docs/planning/in-progress/. Pick the next one (alphabetical filename order works), read it together with the live state of the code it describes, then ship the smallest meaningful next slice — typecheck + lint, commit, push. Annotate the doc with the slice's completion note. When every action item in a doc is shipped or explicitly deferred with a one-line rationale, MOVE the doc from docs/planning/in-progress/ to docs/planning/completed/ per the rubric in docs/planning/README.md. Do not mark items deferred just to empty the folder; defer only when implementation cost clearly exceeds value, and document the reason inline. Once in-progress/ is empty this hook will route the conversation into the QA phase."
  jq -n --arg r "$reason" '{decision: "block", reason: $r}'
  exit 0
fi

if [ "$remaining_qa_items" -gt 0 ]; then
  reason="All planning docs shipped. ${remaining_qa_items} QA item(s) still open in docs/planning/QA_CHECKLIST.md. Pick the next unchecked item, do the actual work it names (verify functionality, fix the UX, flesh out the missing page, etc.), run the relevant checks, commit + push. Flip the checkbox to [x] only when the item is genuinely resolved — not just touched. When every \`- [ ]\` is \`- [x]\` the session will stop on the next turn."
  jq -n --arg r "$reason" '{decision: "block", reason: $r}'
  exit 0
fi

jq -n '{systemMessage: "docs/planning/in-progress/ + QA_CHECKLIST.md both empty — auto-continue loop finished. Session can stop."}'
exit 0
