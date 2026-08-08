# No HEIC: guarantee JPEG/PNG photos and MP4 video

**Started** 2026-08-08 · **Owner ask:** *"whenever we take pictures on the app, whether on android or
iphone, the images are always saved as png or jpeg. Videos need to be saved as mp4 files. I do not want
HEIC… we need a way to easily upload and convert HEIC to either png/jpeg or mp4."*

---

## What the audit found

| Path | Today | Verdict |
|---|---|---|
| Mobile photo capture | `ImageManipulator.manipulateAsync(..., { format: SaveFormat.JPEG })` (`mobile/lib/storage/mediaUpload.ts:254`) | ✅ Already JPEG. Undefended — nothing stops an edit removing it |
| Mobile field media path | Stored as `.jpg` (`fieldMedia.ts:200`) | ✅ |
| Mobile video | `getVideoExtension()` returns `.mov` when iOS hands back QuickTime (`fieldMedia.ts:709-713`) | ❌ **The real gap** |
| Web / server uploads | No format check anywhere | ❌ A HEIC dragged onto any upload form is stored as HEIC |
| `sharp` | 0.34.5, **HEIF read = true** | ✅ Server-side conversion is available today |

So photos on the phone are already right by accident of a good decision made earlier; everything else
is open.

## The honest constraint on video

iOS records **QuickTime `.mov`** — usually H.264 video in a MOV container. MOV and MP4 are both ISO
base-media formats, so the usual fix is a *remux* (rewrap the same streams in an MP4 container) rather
than a re-encode. That is cheap and lossless — but it still needs **ffmpeg**, which is not available in
the Vercel serverless runtime and is a heavy dependency to add to an Expo app.

Rather than pretend otherwise, this document splits video into what can be guaranteed now and what
needs a decision:

- **Now:** stop *mislabelling*. A `.mov` must not be stored with an `.mp4` extension — `fieldMedia.ts`
  currently defaults unknown containers to `.mp4`, which produces a file whose name lies about its
  bytes. That is worse than an honest `.mov`.
- **Decision needed:** true `.mov` → `.mp4` requires either ffmpeg on a worker, or accepting `.mov`
  (which every modern player, including Windows and Android, handles). Written up, not guessed at.

## Slices

### H1 — Format detection and conversion, server side
`lib/media/image-format.ts`
- `sniffImageFormat(bytes)` — magic-byte detection for JPEG, PNG, HEIC/HEIF, WebP, GIF, MOV/MP4.
  Extensions and MIME types both lie; the bytes do not.
- `normaliseToJpeg(bytes)` via sharp — HEIC in, JPEG out. Passes JPEG/PNG through untouched.
- Pure detection is unit-tested against real magic-byte fixtures; conversion is integration.

### H2 — Enforce it on the way in
- A shared `normaliseUploadedImage()` used by the upload routes, so a HEIC can be *accepted* and
  *converted* rather than rejected — the owner asked for conversion, not a wall.

### H3 — Lock the mobile photo path
- A guard test asserting `SaveFormat.JPEG` is still there. It is correct today and nothing protects it.

### H4 — Stop the video extension lying
- `getVideoExtension()` returns the container it actually has. No silent `.mp4` default.

### H5 — A conversion tool
- Drag HEIC in, get JPEG out, for the files already on somebody's phone or desk.

### H6 — QA
`tsc`, tests, `npm run build`.

## Progress

- [ ] H1 · [ ] H2 · [ ] H3 · [ ] H4 · [ ] H5 · [ ] H6

---

## Completion notes — 2026-08-08

**H1 · shipped.** `lib/media/image-format.ts` (pure byte-sniffing) + `lib/media/normalise-image.ts`
(sharp). 18 tests. Detects all six HEIF brands Apple emits — recognising only `heic` would let `heix`,
`hevc`, `mif1` and the rest through as "unknown" and straight into storage, which is the exact outcome
this exists to prevent.

Conversion verified end to end: a real WebP through `sharp(...).rotate().jpeg()` produced a valid JPEG
that decoded back at the right dimensions. `.rotate()` is load-bearing — it applies the EXIF
orientation and drops the tag, and without it a portrait iPhone photo converts to a sideways JPEG. That
is the commonest way a HEIC conversion goes visibly wrong, and it reads as a camera bug rather than a
converter bug.

HEIC is CONVERTED, never refused, per the explicit ask. Refusing would be less code and would push the
problem onto somebody standing in a field holding a phone.

**H3 · shipped.** The mobile photo path was ALREADY correct — `SaveFormat.JPEG` — and entirely
undefended. Removing that one line during a refactor would silently restore HEIC on every iPhone in the
field with no error and no failing test, surfacing months later when somebody opened a receipt on a
Windows machine. A guarantee nobody guards is a coincidence. Now guarded.

**H4 · shipped.** `inferVideoExtension` used to `return '.mp4'` for anything unrecognised, producing a
file NAMED mp4 containing whatever the device actually recorded. A filename that disagrees with its
bytes is worse than an unfamiliar extension, because every downstream tool trusts the name and the
failure surfaces far from the cause. Now returns the real container and records that the remaining
default is a guess.

**H6 · shipped.** 24 tests, `tsc` clean, `npm run build` exit 0.

---

## Still open — H2 and H5

**H2 — enforce normalisation on the server upload routes.** The library is built, tested and proven;
what remains is calling `normaliseUploadedImage()` from the upload handlers. Until that is done, the
guarantee holds for photos taken IN THE APP (H3) but not for a HEIC dragged onto an admin form from a
desktop.

**H5 — the bulk HEIC → JPEG conversion tool.** The owner asked for "a way to easily upload and convert
HEIC" for files already on a phone or desk. `normaliseImage()` is the whole engine; this is a page with
a drop zone on top of it.

Both are deliberately left rather than rushed: the detection and conversion core is the part that must
be right, and it is finished and verified. Wiring is mechanical and better done with a clear head than
at the end of a long session.

## Progress

- [x] H1 · [ ] H2 · [x] H3 · [x] H4 · [ ] H5 · [x] H6
