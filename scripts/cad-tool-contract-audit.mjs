// scripts/cad-tool-contract-audit.mjs — does each tool BEHAVE the way the contract says?
//
// C14b of docs/planning/completed/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// ── HOW THIS DIFFERS FROM cad-click-order-audit.mjs ─────────────────────────────────────────────
//
// C13's audit reads the toolbar DESCRIPTIONS and measures what the product *tells* a surveyor. It
// says so itself: "It has not been checked against the handlers." This one checks the handlers.
//
// The contract's four questions become three things that are actually extractable from the code,
// because each has a single place it must be true:
//
//   2. "How does this end?"  → the tool's handler advances through STAGES. A staged tool keeps a
//      pending pick somewhere in the tool store between click 1 and click 2.
//   3. "How do I get out?"   → the C14 universal Escape must be able to SEE that pending state.
//   4. "What do I get?"      → renderToolPreview must know the tool.
//
// ── THE MEASUREMENT THAT MATTERS ────────────────────────────────────────────────────────────────
//
// The prompt system (`getPromptHint` in CommandBar.tsx) is written as `drawingPointsCount === 0 ? A
// : B`. That is correct for every tool that accumulates clicks into `drawingPoints` — and it is
// silently WRONG for a tool that keeps its first pick in its own field. Such a tool sits on stage 1
// of its prompt forever while the handler waits for stage 2, so the command line asks for something
// the surveyor has already given it.
//
// The same split hits Escape. The C14 universal rule reads `drawingPoints.length > 0` to decide
// "abandon the geometry" versus "leave the tool" — so for a tool whose pending state lives
// elsewhere, one Escape throws away the tool instead of the half-finished pick.
//
// Both are invisible to a description audit, to tsc, and to a screenshot. They are only visible by
// cross-referencing which FIELD the handler writes against which field the prompt and the Escape
// handler read. That is what this does.
//
// Usage:  node scripts/cad-tool-contract-audit.mjs [--json]

import fs from 'node:fs';

const TOOLBAR = 'app/admin/cad/components/ToolBar.tsx';
const COMMANDBAR = 'app/admin/cad/components/CommandBar.tsx';
const VIEWPORT = 'app/admin/cad/components/CanvasViewport.tsx';
const AS_JSON = process.argv.includes('--json');

const toolbarSrc = fs.readFileSync(TOOLBAR, 'utf8');
const commandSrc = fs.readFileSync(COMMANDBAR, 'utf8');
const viewportSrc = fs.readFileSync(VIEWPORT, 'utf8');

/** Setter called in a handler → the tool-store field it makes non-default. Only PENDING fields are
 *  listed: a field that means "this tool is mid-sequence". Option-bar settings (fillet radius,
 *  divide count) are deliberately absent — they persist across tool switches by design. */
const PENDING_FIELD_BY_SETTER = {
  addDrawingPoint: 'drawingPoints',
  setBasePoint: 'basePoint',
  setRotateCenter: 'rotateCenter',
  setOffsetSourceId: 'offsetSourceId',
  setFilletPickedLine: 'filletPickedLineId',
  setChamferPickedLine: 'chamferPickedLineId',
  setMatchPropertiesSourceId: 'matchPropertiesSourceId',
  setPerpAnchor: 'perpStartPoint',
  setArrayPolarCenter: 'arrayPolarCenter',
};

/** Tools whose `drawingPoints` write is a DRAG BUFFER, not a stage.
 *
 *  DRAW_FREEHAND pushes a point on pointer-down and appends on every move, so the field is
 *  non-empty for the whole gesture — but a drag has no "stage 2" to advertise and the prompt
 *  ("press and drag … release to finish") is complete as written. Exempted rather than special-
 *  cased in the report, so the exemption is a stated rule instead of a number that looks clean. */
const DRAG_CAPTURE = new Set(['DRAW_FREEHAND']);

/** Tools the contract does NOT ask for a live preview from.
 *
 *  Zero-click tools create nothing. Pick-then-act tools get the contract's "hover highlights what
 *  will be affected", which is the general geometry-traced hover glow every tool shares — not
 *  something `renderToolPreview` would ever mention. And two tools cannot preview before their
 *  numeric input arrives: CURB_RETURN's arc needs the typed radius and FORWARD_POINT's position
 *  needs the typed bearing and distance, so there is nothing to draw until the moment they commit.
 *
 *  DRAW_TEXT and DRAW_IMAGE join them for the same reason from the other direction: the click only
 *  chooses a location and an editor then authors the content, so at preview time the content does
 *  not exist. DRAW_POINT, the third one-click place tool, is NOT exempt — what it places is fully
 *  determined before the click, and C14b gave it the cursor ghost it had always been missing. */
const PREVIEW_EXEMPT = new Set([
  'SELECT', 'PAN',
  'DRAW_TEXT', 'DRAW_IMAGE',
  'ERASE', 'EXPLODE', 'REVERSE', 'LIST', 'SMOOTH_POLYLINE', 'SIMPLIFY_POLYLINE',
  'TRIM', 'EXTEND', 'SPLIT', 'JOIN', 'DIVIDE', 'MATCH_PROPERTIES',
  'INSERT_VERTEX', 'REMOVE_VERTEX', 'POINT_AT_DISTANCE',
  'CURB_RETURN', 'FORWARD_POINT',
]);

/** What each prompt expression reads. `drawingPointsCount` is the parameter name inside
 *  getPromptHint; the others arrive under their own names.
 *
 *  After C14b, `drawingPointsCount` is fed `pickStage(toolState)` rather than
 *  `drawingPoints.length`, so it stands for "the tool's pick stage, whichever field holds it". The
 *  audit's job therefore MOVED: it is no longer "does this prompt read this field", which nothing
 *  will ever satisfy again, but "is this field in the store's list", which is the invariant that
 *  actually keeps the prompt and Escape correct as tools are added. */
const PENDING_FIELD_BY_PROMPT_READ = {
  drawingPointsCount: 'drawingPoints',
  basePoint: 'basePoint',
  rotateCenter: 'rotateCenter',
};

/** The single source of truth C14b introduced. Both the prompt and the Escape handler route
 *  through it, so it is what the handlers must be checked against. */
const TOOL_STORE = 'lib/cad/store/tool-store.ts';

// ── 1. The tools ────────────────────────────────────────────────────────────────────────────────
function toolbarTools() {
  const seen = new Set();
  const re = /\{\s*tool:\s*'([A-Z_]+)'\s*,\s*label:\s*'((?:[^'\\]|\\.)*)'/g;
  let m;
  const out = [];
  while ((m = re.exec(toolbarSrc)) !== null) {
    if (seen.has(m[1])) continue; // DRAW_LINE and DRAW_FREEHAND each appear as several presets
    seen.add(m[1]);
    out.push({ tool: m[1], label: m[2].replace(/\\'/g, "'") });
  }
  return out;
}

// ── 2. The prompt cases ─────────────────────────────────────────────────────────────────────────
/** Body of `getPromptHint`, sliced at its `default:`. */
function promptBody() {
  const start = commandSrc.indexOf('function getPromptHint(');
  if (start < 0) throw new Error('getPromptHint not found — CommandBar.tsx has moved');
  const end = commandSrc.indexOf('\n    default:', start);
  return commandSrc.slice(start, end < 0 ? commandSrc.length : end);
}

/** For each tool, the pending fields its prompt branches on. Fall-through cases
 *  (`case 'A': case 'B': return …`) share one body. */
function promptReads() {
  const body = promptBody();
  const lines = body.split('\n');
  const out = new Map();
  let pending = [];
  for (const line of lines) {
    const caseM = line.match(/^\s*case '([A-Z_]+)':\s*$/);
    if (caseM) { pending.push(caseM[1]); continue; }
    const caseInline = line.match(/^\s*case '([A-Z_]+)':\s*\S/);
    if (caseInline) pending.push(caseInline[1]);
    if (!pending.length) continue;
    // Accumulate until the case body ends (the next `case` line, handled above).
    const bodyStart = body.indexOf(line);
    void bodyStart;
    // Collect the whole body for these tools: everything up to the next `case '`.
    if (/^\s*case '/.test(line) && !caseInline) continue;
    const rest = body.slice(body.indexOf(line));
    const nextCase = rest.slice(1).search(/\n\s*case '[A-Z_]+':/);
    const chunk = nextCase < 0 ? rest : rest.slice(0, nextCase + 1);
    const reads = Object.keys(PENDING_FIELD_BY_PROMPT_READ)
      .filter((k) => new RegExp(`\\b${k}\\b`).test(chunk))
      .map((k) => PENDING_FIELD_BY_PROMPT_READ[k]);
    for (const t of pending) out.set(t, [...new Set(reads)]);
    pending = [];
  }
  return out;
}

// ── 3. The handler cases ────────────────────────────────────────────────────────────────────────
/** The `handleMouseDown` tool switch, one chunk per tool. Fall-through cases share a chunk.
 *
 *  The switch is BOUNDED at its closing brace on purpose. The first draft let the last case run to
 *  end of file, which handed CURB_RETURN every `setOffsetSourceId` call in the remaining 1,400
 *  lines and reported it as a staged tool parking an offset source. It parks `drawingPoints`, its
 *  prompt reads them, and it was correct all along — a finding manufactured entirely by the
 *  measurement, which is exactly the shape this document keeps paying for. */
function handlerWrites() {
  const lines = viewportSrc.split('\n');
  const caseRe = /^\s{8}case '([A-Z_]+)':/;
  const marks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(caseRe);
    if (m) marks.push({ tool: m[1], line: i, fallsThrough: !/\{\s*$/.test(lines[i]) });
  }
  // Only the tool switch — geometry-type cases ('POINT', 'LINE') live in a different switch and are
  // filtered out by intersecting with the toolbar list downstream.
  const out = new Map();
  /** First line at or after `from` that closes the switch (six-space `}`). */
  const switchEnd = (from) => {
    for (let i = from; i < lines.length; i += 1) if (lines[i] === '      }') return i;
    return lines.length;
  };
  for (let i = 0; i < marks.length; i += 1) {
    const from = marks[i].line;
    const to = i + 1 < marks.length ? marks[i + 1].line : switchEnd(from);
    let chunk = lines.slice(from, to).join('\n');
    // A fall-through case owns the NEXT case's body too.
    let j = i;
    while (marks[j] && marks[j].fallsThrough && j + 1 < marks.length) {
      j += 1;
      const f2 = marks[j].line;
      const t2 = j + 1 < marks.length ? marks[j + 1].line : switchEnd(f2);
      chunk += '\n' + lines.slice(f2, t2).join('\n');
    }
    const writes = Object.keys(PENDING_FIELD_BY_SETTER)
      .filter((s) => new RegExp(`\\b${s}\\(`).test(chunk))
      .map((s) => PENDING_FIELD_BY_SETTER[s]);
    const prev = out.get(marks[i].tool) ?? [];
    out.set(marks[i].tool, [...new Set([...prev, ...writes])]);
  }
  return out;
}

// ── 4. What the shared pending-pick definition covers ───────────────────────────────────────────
/** The fields listed in `PENDING_PICK_FIELDS` in the tool store. */
function storePendingFields() {
  const src = fs.readFileSync(TOOL_STORE, 'utf8');
  const start = src.indexOf('const PENDING_PICK_FIELDS');
  if (start < 0) throw new Error('PENDING_PICK_FIELDS not found — the C14b definition has moved');
  const end = src.indexOf('\n];', start);
  const chunk = src.slice(start, end < 0 ? src.length : end);
  const fields = new Set(['drawingPoints']); // always covered — `hasPendingPick` opens with it
  for (const m of chunk.matchAll(/field:\s*'([A-Za-z]+)'/g)) fields.add(m[1]);
  return fields;
}

/** Do the prompt and the Escape handler both route through the shared definition? If either stops
 *  doing so, every per-tool result below becomes meaningless, so it is checked first. */
function wiring() {
  const escStart = viewportSrc.indexOf("if (e.key === 'Escape' && snapPickRef.current)");
  const escEnd = viewportSrc.indexOf('const onKeyUp =', escStart);
  const escChunk = viewportSrc.slice(escStart < 0 ? 0 : escStart, escEnd < 0 ? viewportSrc.length : escEnd);
  return {
    escapeUsesShared: /hasPendingPick\(/.test(escChunk) && /clearPendingPick\(\)/.test(escChunk),
    promptUsesShared: /pickStage\(toolState\)/.test(commandSrc),
  };
}

// ── 5. What the preview knows ───────────────────────────────────────────────────────────────────
function previewTools() {
  const start = viewportSrc.indexOf('function renderToolPreview()');
  const lines = viewportSrc.split('\n');
  const startLine = viewportSrc.slice(0, start).split('\n').length - 1;
  let endLine = lines.length;
  for (let i = startLine + 1; i < lines.length; i += 1) {
    if (lines[i] === '  }') { endLine = i; break; }
  }
  const chunk = lines.slice(startLine, endLine).join('\n');
  const found = new Set();
  for (const m of chunk.matchAll(/'([A-Z_]{3,})'/g)) found.add(m[1]);
  return found;
}

// ── Report ──────────────────────────────────────────────────────────────────────────────────────
const tools = toolbarTools();
const prompts = promptReads();
const handlers = handlerWrites();
const covered = storePendingFields();
const previews = previewTools();
const wired = wiring();

const rows = tools.map(({ tool, label }) => {
  const writes = (handlers.get(tool) ?? []).filter(() => !DRAG_CAPTURE.has(tool));
  // A tool is STAGED when its handler parks a pending pick between clicks. A staged tool is served
  // correctly when EVERY field it parks is in the store's list, because that list is what both the
  // prompt stage and the Escape branch are computed from.
  const uncovered = writes.filter((f) => !covered.has(f));
  return {
    tool,
    label,
    hasPrompt: prompts.has(tool),
    staged: writes.length > 0,
    writes,
    uncovered,
    hasPreview: previews.has(tool) || PREVIEW_EXEMPT.has(tool),
    previewExempt: PREVIEW_EXEMPT.has(tool),
  };
});

if (AS_JSON) {
  console.log(JSON.stringify({ wiring: wired, tools: rows }, null, 2));
} else {
  const noPrompt = rows.filter((r) => !r.hasPrompt);
  const invisible = rows.filter((r) => r.uncovered.length > 0);
  const noPreview = rows.filter((r) => !r.hasPreview);
  const staged = rows.filter((r) => r.staged);

  console.log(`\n  ${rows.length} tools measured against docs/cad-click-order-contract.md`);
  console.log(`  ${staged.length} of them are staged (park a pending pick between clicks)\n`);
  console.log(`  prompt routes through pickStage()        ${wired.promptUsesShared ? 'yes' : 'NO'}`);
  console.log(`  Escape routes through hasPendingPick()   ${wired.escapeUsesShared ? 'yes' : 'NO'}\n`);
  console.log(`  no prompt case at all                    ${noPrompt.length}`);
  console.log(`  pending pick INVISIBLE to both           ${invisible.length}`);
  console.log(`  not referenced by renderToolPreview      ${noPreview.length}\n`);

  const list = (title, rs, detail) => {
    if (!rs.length) return;
    console.log(`  ── ${title} ──`);
    for (const r of rs) console.log(`     ${r.tool.padEnd(22)} ${detail ? detail(r) : r.label}`);
    console.log('');
  };
  list('no prompt case', noPrompt);
  list('parks a field PENDING_PICK_FIELDS does not list', invisible, (r) =>
    `${r.uncovered.join(', ')} — prompt will freeze on stage 1 and Escape will drop the tool`);
  list('no preview', noPreview);

  const bad = invisible.length + noPrompt.length
    + (wired.promptUsesShared ? 0 : 1) + (wired.escapeUsesShared ? 0 : 1);
  if (bad === 0) console.log('  ✓ every staged tool is visible to the prompt and to Escape\n');
  process.exitCode = bad > 0 ? 1 : 0;
}
