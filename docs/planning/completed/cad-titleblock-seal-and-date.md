# Title-Block: Seal Image + Fillable Date + Scale Agreement — Build Plan

Status: **completed** · Owner: CAD/UX · Opened: 2026-05-27 · Closed: 2026-05-27

Drives the Stop-hook loop. Build each slice (tsc + eslint + harness verify
where feasible), commit + push to `claude/nice-bardeen-YpOrt`, annotate §3.
When all slices ship (or are deferred with a one-line reason), move this
doc to `docs/planning/completed/`.

## 2. Backlog (top = next)

- [x] **TBscale. Graphic scale ⇄ title-block SCALE agreement.** DONE (commit
  7ca96e2) — fit-to-page reverts an auto "1\" = N'" label to auto; picking a
  scale from the SCALE dropdown sets drawingScale so the bar follows.

- [x] **TB1. Fillable DATE line in the signature block.** DONE — added the
  `signatureDate` title-block field; its value renders above the date line;
  the date area is registered as a clickable field so the existing
  click-to-edit input fills it. tsc + eslint clean.

- [x] **TB2. Official seal image (local upload + render).** DONE — added
  `sealImageDataUrl`; clicking the OFFICIAL SEAL area opens a local image
  picker; the chosen image is read as a data URL, stored on the title block,
  and rendered (square, fit to the seal column) via a reused Pixi sprite
  (mirrors the firm-logo path); clicking again replaces it. Saves with the
  drawing to the cloud. tsc + eslint clean. (Canvas-click verification is
  manual — not feasible headless.)

- [x] **TB3. Shared cloud seal-image library (reuse across drawings).** DONE
  — per the surveyor's choice (Supabase Storage bucket, shared org-wide).
  Reused the existing `cad-images` public bucket + `ensureStorageBucket`;
  added a GET listing the shared `seals/` prefix and a `folder:'seals'`
  POST path. New SealPickerModal (opened by clicking the seal): upload from
  computer (saves to the cloud library AND uses it, with inline-data-URL
  fallback if storage is unavailable), pick a previously-saved seal, or
  remove. tsc + eslint clean; modal chrome verified (`seal-picker.spec`).
  Cloud upload/list need Supabase, so the bucket round-trip is manual-verify.

## 3. Audit Log

- 2026-05-27 — Opened. TBscale already shipped (7ca96e2). Next: TB1.
- 2026-05-27 — TB1 + TB2 shipped. Fillable signature-block DATE line +
  official-seal local image upload/render (titleBlock.signatureDate /
  sealImageDataUrl). tsc + eslint clean. TB3 (cloud image library) pending a
  storage-approach decision with the user.
- 2026-05-27 — Hardened TBscale: the SCALE field now ALWAYS derives from
  drawingScale (numeric overrides ignored) so it can't drift from the bar
  even without a fit-to-page (commit 9867a99).
- 2026-05-27 — TB3 shipped + loop CLOSED. Surveyor chose Supabase bucket +
  shared org-wide. SealPickerModal (upload-to-cloud / pick-saved / remove)
  over the shared `seals/` prefix of the existing cad-images bucket. All
  slices done; moving doc to completed/.
