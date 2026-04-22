# Planning Docs

Planning docs are time-boxed: they describe work that is either underway or has shipped, and they have a finite lifespan. This is in contrast to the live specs in `docs/platform/`, `docs/product/`, and `docs/engine/`, which are kept current as long as the system they describe exists.

This folder uses three subfolders to make the lifecycle visible at a glance.

## The three folders

| Folder | When a doc lives here |
|--------|------------------------|
| [`completed/`](./completed/) | The phase or feature it describes has shipped. Kept for historical decision context. Code may still reference it (`// Spec: docs/planning/completed/...`). |
| [`in-progress/`](./in-progress/) | The doc has action items not yet done, or describes a roadmap phase still ahead, or is the live spec referenced by working code. |
| [`obsolete/`](./obsolete/) | Superseded by a newer doc, no code references it, no decisions in it that aren't captured elsewhere. **Sits here for one PR-cycle grace period before actual deletion.** Never delete a planning doc directly — move it here first. |

## Classification rubric

Use this when classifying a planning doc you're moving in.

### COMPLETED — all of:

- The phase or feature it describes has shipped
- Code references to it (`// Spec: docs/...`) still resolve
- It contains historical decisions worth preserving

### IN-PROGRESS — any of:

- It contains action items not yet done
- It describes a phase still on the roadmap
- Code comments reference it as the live spec

### OBSOLETE — all of:

- Superseded by a newer doc in `docs/platform/` or `docs/product/`
- No code currently references it
- It contains no decisions or context not captured elsewhere

### When unsure

Classify as **IN-PROGRESS** and flag in the PR description for human review. Never delete or mark obsolete without explicit confirmation. Moves are always reversible in a single revert; deletions are not.

## Lifecycle moves

```
new doc           ─▶   in-progress/
in-progress/      ─▶   completed/      (when work ships)
completed/        ─▶   obsolete/       (when superseded by a live spec elsewhere)
in-progress/      ─▶   obsolete/       (when abandoned without shipping)
obsolete/         ─▶   <deleted>       (after one PR-cycle grace, with explicit confirmation)
```

When moving a doc:

1. Update any `// Spec: docs/planning/...` TypeScript comments that reference its old path.
2. Update markdown cross-links that point at its old path (`grep -rln "<old-path>" .`).
3. Note the move in the PR description with a one-line rationale.

## Current planning docs

(See `ls` in each subfolder for the live list — this README is the rubric, not the manifest.)

The 2026-04 cleanup PR (PR 1) moved several Phase-N spec sets (`STARR_CAD/`, `STARR_RECON/`) into `in-progress/` as cohesive units to preserve intra-folder relative links. A future cleanup pass can split them per-phase once each Phase's actual ship status is verified against the codebase.
