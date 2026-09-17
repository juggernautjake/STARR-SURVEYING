# Interactive Property Map — per-job aerial with points of interest

**Started:** 2026-09-16 · **Owner request, verbatim:**

> "For each job, I want it so that we can create an interactive map. I want it so that we can upload
> an aerial/satellite view of the property, and then I want it where we can place points of interest
> on the map image. It would be basically placing a dot on the map. Now, with that dot we can attach
> meta data. We can attach notes, and we can attach images and videos. We can attach audio
> recordings. Then, whenever the user looks at the map, they will be able to see all of the points of
> interest, and the points will all be labeled with numbers, and a title. There will be list on the
> side of all of them so the user can find the point both on the map itself and in the list of
> points. If the user hovers over a point on the map, then it should have a little enlargement
> animation and get a slight glowing highlight and should show the title of the point of interest,
> and there should be a little pop up that previews all of the metadata for the point… Then if the
> user clicks on it, it will open all of the data related to that point in a panel where the user can
> watch the videos and review the notes and images and audio files related to that point. if the user
> highlights or clicks a point on the map, then that same point in the list should also be
> highlighted or selected, and vice versa. This will make it so that the drawer or anybody that is
> trying to look at all of the pictures or videos or other information about a property can look at
> the interactive map and then see all of the specific information about various parts of the
> property… There should just be a button in each job page that first says, "Create Interactive Map"
> and then once it has been created, it can say, "View Interactive Map"… Make the styling and UI look
> really good and be really responsive and functional. Please make sure that the rendering of images
> and videos and stuff related to each point is very easy to load quickly. The interactive map can
> take a second to load if needed to start loading the different videos and images and stuff to make
> them available for immediate viewing. Please make sure it is efficient and easy to use and that the
> loading doesn't take forever."

---

## What this is really for

The sentence that decides the design is *"this will help us document specific features of a job
easily and keep track of them and where they are at on the property."* This is not a mapping toy. It
is **the drafter's answer to "what did the crew see, and where"** — today that lives in a folder of
four hundred photos named `IMG_4471.JPG`, and the only person who knows which fence corner that is,
is the person who took it, three weeks ago.

So every decision below resolves toward: *a person who was never on that property can open this and
understand it.* That is the acceptance test for the whole feature.

### Who uses it, and what they need

| Person | What they do with it |
|---|---|
| **Field crew** (Jacob) | Drops pins as they walk the property; photo, a 10-second voice note, move on. Phone, one hand, gloves, sunlight. Speed beats polish. |
| **Drafter** | Opens it beside CAD. Needs to find "the pipe at the NE corner" in two seconds and see every photo of it at once. |
| **Hank (RPLS)** | Reviews before sealing. Needs to see problems flagged — encroachments, missing monuments, access trouble. |
| **Client** *(later)* | A clean, numbered picture of their property with the findings on it. Phase 8. |

---

### Follow-up from the owner, same day — now part of the core, not extras

> "you should be able to turn point labels on and off. Also, we should be able to make the points of
> interest appear as different colors depending on what they are. there should be a generic point of
> interest, but there can be points of interest related to buildings, utilities, fences, property
> boundaries, street view, and whatever you can think of. The default for a new point of interest is
> the generic kind. We should be able to view the interactive map as is, but also we should be able
> to edit it in order to add or remove points of interest, or just add new info to already existing
> points of interest, or remove data from already existing points of interest."

Three things, and they change the shape of the build rather than sitting at the end of it:

**A. Typed, coloured points are Phase 2, not Phase 6.** A point's type is a first-class column from
the first migration, `generic` is the default, and the colour comes from the type. The catalogue
below is the starting set; adding one later is a line in `POINT_TYPES` and a token, nothing else.

| Type | What it marks | Colour role |
|---|---|---|
| `generic` *(default)* | Anything worth a dot. The one you get without choosing. | neutral / slate |
| `boundary` | A property line, a corner in question, a line of occupation | the survey accent |
| `monument_found` | An existing pin, rod, pipe or axle located on the ground | green |
| `monument_set` | A corner the crew set | green, hollow centre |
| `building` | A house, barn, shed, slab, foundation | warm brown |
| `utility` | Meter, pole, pedestal, riser, manhole, buried line marker | amber |
| `fence` | A fence, gate post, or a change in fence type | tan |
| `street_view` | A "stand here and look this way" vantage photo | blue |
| `access` | Gate, cattle guard, locked entry, the way in for the truck | blue-grey |
| `encroachment` | Something across a line — the thing Hank must see | red |
| `water` | Creek, pond, drainage, culvert, flood-prone ground | teal |
| `vegetation` | Heavy brush, tree line, a clearing problem for the crew | olive |
| `easement` | A recorded easement's location on the ground | purple |
| `hazard` | Dog, bull, unstable ground, live wire — crew safety | red-orange |

Rules: every type has a colour token, a lucide icon and a spoken label; the legend lists only the
types actually present on the map; changing a point's type is one control in the editor; colour is
never the *only* signal (icon + number + label carry it too, for colour-blind readers and for print).

**B. Labels toggle on and off.** A display control over the map — `Labels: on / off`, remembered per
person in `localStorage`. Off, a pin is a numbered dot; on, it carries its title. Two more toggles
belong with it, for the same reason: **Numbers** on/off, and **Type filter** (show only encroachments,
say). This lives in Phase 4 with the rest of the display behaviour, but the label rendering is built
in Phase 2 so it is not retrofitted.

**C. View mode and Edit mode are separate, and View is the default.** Opening a map never risks
changing it. A clear **Edit map** button flips into edit mode, which is the only mode where the
cursor places pins, pins can be dragged, and delete/attach/detach controls exist. Edit mode shows a
visible banner so nobody is ever unsure which they are in, Escape leaves it, and leaving with unsaved
inline text prompts. Everything an editor can do, per the request: add a point, remove a point, add
information to an existing point (notes, photos, video, audio, type, title), and remove information
from an existing point (detach media, clear notes).

### Second follow-up: a point of interest is not always a point

> "I want to be able to create a point that is just a single point on the map. Then I want to create
> a point that has a field of view feature, where you can set the point, and then you can show the
> field of view of that point. This would be for pictures that are taken and the uploader wanted to
> show where they were and what direction they were facing and what their field of view was when
> they took the picture. I also want to create a mechanic where the user create the first point, then
> can click to draw connected lines that represent what path they walked. This would be for if the
> user takes a video and starts at one point and then walks to another point, taking a video of the
> property as they go … The user would need to be able to define the field of view too, how wide or
> narrow it is and in what direction from the point."

Four shapes, one table, one list. The temptation is a table per shape; resist it. What is described
here is not four features — it is one feature, *"here is a thing on this property and here is what I
know about it"*, drawn four ways. Everything that makes a point useful (the number, title, notes,
type, status, photos, video, voice notes) is identical across all four, and splitting the table
makes the side list a union query that can never be ordered properly.

| Shape | What it is for | How it is drawn |
|---|---|---|
| `point` | One spot. The default, and what most things are. | Click. |
| `fov` | Where somebody stood and which way they faced, for a photo. | Click where you stood, drag to aim. Handles for direction and width, or type the numbers. |
| `path` | A route walked while recording a video. | Click the start, click each turn, double-click / Enter / Finish to end. |
| `area` | A region: heavy brush, a flood-prone corner, the wrong stretch of fence. | Click each corner, double-click / Enter / Finish to close. |

**`x`/`y` stays required for every shape.** It is where the numbered marker sits, what the list
scrolls to, and what still renders if the rest fails — a path whose vertices will not parse is a
labelled dot at the trailhead, never a missing row.

**The trigonometry happens in pixels, the data lives in fractions.** Fractions of the image box are
not isotropic: on a 4000×3000 aerial, 0.1 across is 400 px and 0.1 down is 300 px. Do the angles in
fraction space and a cone aimed north-east points somewhere else, and a "straight" path measures
wrong. `lib/jobs/property-map-shapes.ts` converts in, works, and converts back; the tests pass a 4:3
box precisely to hold that line.

**Measurements are only made where they can be honest.** A path's length in feet and an area's size
in acres need a georeferenced map (Phase 7). Without one, the list says "2 legs" and "3 corners" and
nothing else. An invented distance on a surveyor's drawing is worse than no distance.

**The instructions are on screen while you draw.** Every shape carries a `howTo` string that the
editor shows in a hint bar during placement — "Click where you started, then click each turn you
made. Double-click, press Enter, or hit Finish to end it." That, rather than a help page, is what
"easy to learn" means here.

**Rejected for now:** freehand drawing (produces hundreds of vertices nobody can edit), and a
separate "arrow" shape (a narrow `fov` already is one).

## Additions beyond the literal request, and why each earns its place

Everything the owner asked for is in Phases 1–5. These are the additions, each justified by the job
the feature actually does. Anything that could not be justified that way was left out (a list of
those is at the bottom, so the decision is visible rather than silently missing).

1. ~~**Typed points with their own colour and icon.**~~ — **promoted to Phase 2 by the owner's
   follow-up above.** A survey map where every dot looks the same is a list, not a map.
2. **Point status: open / resolved / needs attention** — the crew's "come back to this" survives the
   drive home. Turns the map into the punch list it will be used as anyway. **Phase 6.**
3. **Search and filter the point list** — a forty-point map is unusable without it. **Phase 6.**
4. **Place a pin at my current location** — on a georeferenced map, the crew's phone knows where they
   are standing. This is the single biggest time-saver for the person holding the phone. **Phase 7.**
5. **Georeferencing (two-point affine)** — the operator clicks two spots and gives their lat/long
   (or drops the pin on two known corners). From then on every pin has real coordinates: "open in
   Google Maps", "navigate here", and export to CAD. Optional; the map works fully without it.
   **Phase 7.**
6. **Approximate distance between two pins** — falls out of georeferencing for free and answers
   "how far is that pipe from the road?" without a trip. **Phase 7.**
7. **Export: a numbered map + legend + notes as a PDF** — the deliverable-adjacent artefact. The
   drafter attaches it to the plat package; Hank emails it to a client. **Phase 8.**
8. **Attach files already in the job** — the crew uploaded 40 photos through the normal uploader this
   morning; pinning one must not mean uploading it twice. **Phase 3.**
9. **Voice notes recorded in the browser** — `AudioRecorder` already exists in the fieldbook. A pin
   with a 15-second "this corner was under a brush pile, we dug 8 inches" is worth a paragraph
   nobody will type. **Phase 3.**
10. **Activity trail on the map** — who placed a pin and when, in the job's existing activity feed.
    Chain of custody matters on a sealed survey. **Phase 6.**
11. **Multiple maps per job** — an overall aerial plus a detail inset of the crowded corner. The
    schema supports it from day one (`job_property_maps` is a list, not a singleton); the UI exposes
    it in **Phase 6**.
12. **Keyboard navigation** — arrow keys move through pins, Enter opens, Escape closes. The drafter
    lives on a keyboard, and it makes the thing accessible for free. **Phase 4.**

### Deliberately NOT building (and why)

- **Drawing lines and polygons.** Real value, but it is a second feature wearing this one's clothes,
  and CAD already draws. Revisit only if asked.
- **Tiled/zoomable giant imagery (deep zoom).** A 4000×3000 aerial is ~3 MB and browsers handle it.
  Tiling is weeks of work for imagery we do not have.
- **Live collaborative editing.** Two people editing the same map at once is not a real scenario
  here. Last-write-wins with an `updated_at` check is enough.
- **Offline-first field capture.** The background uploader already survives a bad signal. A true
  offline store is its own project.

---

## Architecture decisions, made up front

**Coordinates are 0–1 floats of the image's own box.** Not pixels. The aerial can be replaced with a
better scan, the browser can be any width, and the pins stay where they were put.

**Pins are absolutely-positioned `<button>`s over an `<img>`, not SVG.** Real focusable elements, CSS
`:hover`/`:focus-visible` for the enlarge-and-glow, no manual hit-testing. (`FieldWorkView` uses SVG
because it draws geometry; we draw an image.)

**One request loads a map.** `GET /api/admin/jobs/[id]/property-map` returns the map, every point,
every media row, and **batch-signed URLs for every thumbnail plus every full-size item** in a single
round trip. The alternative — a signed-URL request per photo — is the thing that would make this
"take forever", and it is the mistake to design out on day one, not profile later.

**Thumbnails are generated at attach time, server-side, with `sharp`.** 400 px WebP, stored beside
the original. The repo has `normaliseImage` for exactly this. Video gets a poster frame captured
client-side at attach time (a `<canvas>` grab at 0.1 s) and uploaded as its thumbnail; audio gets an
icon, no thumbnail.

**Loading is staged, and the stages are visible.** (1) map + points + thumbnails — the page is usable;
(2) prefetch the full-size media of the first point and of whatever the cursor is near; (3) everything
else lazily. `<video preload="metadata">` always — never `auto`, which would pull 40 MB of video
nobody asked for.

**Media rows point at `job_files`.** Attaching does not copy bytes; it links. So a photo pinned to a
point is still in the job's Photos folder, still in search, still in the file viewer — one file, two
ways to find it.

---

## Phase 0 — Schema and the pure core

- [x] `seeds/641_job_property_maps.sql` — three tables, following `seeds/639` exactly (prose header
      with the owner quote and the rejected alternatives, `BEGIN/COMMIT`, `IF NOT EXISTS`, `org_id`,
      `created_at/updated_at`, `deleted_at`, partial indexes with a comment naming the query, RLS
      enabled and denied, `set_updated_at` trigger):
  - `job_property_maps` — `id, org_id, job_id → jobs(id) ON DELETE CASCADE, title, file_id →
    job_files(id), image_width, image_height, georeference jsonb, created_by, …, deleted_at`
  - `job_map_points` — `id, map_id → job_property_maps(id) ON DELETE CASCADE, ordinal int, title,
    notes, x double precision CHECK (x BETWEEN 0 AND 1), y (same), point_type text, status text,
    lat/lng double precision NULL, created_by, …, deleted_at`
  - `job_map_point_media` — `id, point_id → job_map_points(id) ON DELETE CASCADE, job_file_id →
    job_files(id) ON DELETE CASCADE, kind text CHECK (kind IN ('image','video','audio','document')),
    thumb_path text, thumb_bucket text, caption text, ordinal int, created_at`
  - unique index on `(map_id, ordinal) WHERE deleted_at IS NULL`
- [x] `lib/jobs/property-map.ts` — **no React, no I/O, unit-testable**: `clampToImage(x, y)`,
      `renumber(points)`, `nextOrdinal(points)`, `mediaKindFor(mime)`, `pointLabel(point)`,
      `sortPoints(points)`, `POINT_TYPES`/`POINT_STATUSES` with labels and token names,
      `affineFromTwoPoints()` + `pixelToLatLng()` (used in Phase 7, pure now), and the
      `PropertyMap`/`MapPoint`/`PointMedia` types the whole feature shares.
- [x] `__tests__/jobs/property-map.test.ts` — the pure module, hard: clamping at the edges and
      outside, renumbering after a delete in the middle, ordinal collisions, every MIME the uploader
      accepts mapping to the right kind, affine round-trips.
- [x] Apply the seed to the database and confirm the tables exist.

**Done when:** the seed is applied, the module is covered, `npx tsc --noEmit` is clean.

## Phase 1 — Create a map, upload the aerial, see it

- [x] `GET/POST /api/admin/jobs/[id]/property-map` — GET returns `{ map, points, media, urls }` (or
      `{ map: null }`); POST creates the map row. Auth exactly like
      `app/api/admin/jobs/files/route.ts` (`auth()` + `isAdmin`, `withErrorHandler`, `{ error }`
      shape).
- [x] Aerial upload reuses `uploadJobFileBytes` (three-step direct-to-Supabase) and files the image
      into the job's **Photos** section so it is a normal job file; the map row links to it.
      Server-side: read the natural dimensions and store them.
- [x] `app/admin/jobs/[id]/map/page.tsx` + `PropertyMap.css` — the page shell: title, the aerial
      rendered to fit with `object-fit: contain` in a `position: relative` frame, an empty side
      panel, and an empty state that explains what to do.
- [x] The job page button: a new **Property Map** tab in `TABS` (`app/admin/jobs/[id]/page.tsx`)
      whose body shows **"Create Interactive Map"** when there is no map and **"View Interactive
      Map"** (plus a thumbnail and the point count) when there is. Copy the `job-cad-start` card
      pattern.
- [x] Tests: route contract (source-read), tab wiring, empty state.

**Done when:** an aerial can be uploaded from the job page and comes back on reload.

## Phase 2 — Points: place, type, edit, list, select

- [x] `POST/PATCH/DELETE /api/admin/jobs/[id]/property-map/points` — create at `(x, y)`, edit title /
      notes / type / status / position, soft-delete and renumber.
- [x] **View mode and Edit mode.** View is what opening the map gives you and it cannot change
      anything; an **Edit map** button enters edit mode, which shows a banner, enables placing,
      dragging, deleting and attaching, and exits on Escape or **Done**.
- [x] **Point types.** `point_type` on the row, `generic` by default, the catalogue and colours from
      `POINT_TYPES` in the pure module. The pin takes its colour token and icon from the type; the
      type is a control in the point editor; the legend shows only the types in use.
- [x] Labels rendered with the pin (title beside the dot) behind a `showLabels` flag — the toggle
      itself is Phase 4, but nothing about labels is retrofitted later.
- [x] Placement (edit mode only): an **Add point** cursor; click (or tap) on the image converts to
      0–1 via `getBoundingClientRect` (the `svgPoint` math from `InteractiveBoundaryViewer`), opens a
      small inline form (title, then type, notes optional), saves optimistically.
- [x] Drag a pin to move it (edit mode); drop commits. Touch supported (pointer events, not mouse
      events).
- [x] Removing information from an existing point, not only adding it: clear the notes, change the
      type back to generic, detach a photo — each one control, each one request, each undoable by
      doing the opposite.
- [x] The side list: number, title, type chip (coloured), status, media count. Ordered by ordinal.
- [x] **Selection is one piece of state, shared.** `selectedPointId` drives both; clicking either
      selects both; the list scrolls the selection into view
      (`querySelector('[data-point-id="…"]')`, the `FieldWorkView` pattern).
- [x] Tests: the placement maths, renumbering after delete, selection sync (pure reducer level).

**Done when:** points can be placed, moved, renamed, deleted, and the list and map agree at all
times.

## Phase 2b — Four shapes, not one (the second follow-up)

- [x] `seeds/642_job_map_point_shapes.sql` — `geometry`, `vertices` (jsonb), `bearing_deg`,
      `fov_deg`, `fov_radius` on `job_map_points`, with CHECKs that a cone cannot be stored pointing
      nowhere and existing rows become `point`.
- [x] `lib/jobs/property-map-shapes.ts` — the whole geometry layer, pure: `POINT_GEOMETRIES` with a
      `howTo` per shape, cone path/handle maths, vertex append with a zero-length guard, path length
      in feet and area in acres (only where georeferenced), label placement, `shapeSummary`,
      `isDrawable`.
- [x] The points API accepts and clears the new columns; switching a cone back to a dot clears the
      bearing, and a vertex list is cleaned and capped before it is stored.
- [x] The loader returns them, degrading an unreadable vertex list to the anchor.
- [x] `__tests__/jobs/property-map-shapes.test.ts` — 27 tests, including the 4:3 aspect-ratio trap.
- [ ] The editor: shape picker with hints, live drawing with a rubber band, Enter/double-click to
      finish, Escape to cancel, Backspace to undo a vertex.
- [ ] Cone editing: an aim handle, a width handle, numeric bearing and width, camera presets.
- [ ] Shape editing: drag a vertex, insert one at a segment midpoint, delete one, change a point's
      shape after the fact.
- [ ] The SVG overlay: cones, paths and areas drawn under the pins, honouring selection, hover and
      the type filter.

## Phase 3 — Attach media to a point

- [x] `POST/DELETE /api/admin/jobs/[id]/property-map/points/[pointId]/media` — attach an existing
      `job_files` row, or accept a freshly uploaded one; detach.
- [x] Attach **from the job's existing files** via `FileExplorerDialog`, filtered to media kinds.
- [x] Attach **by uploading**: drag/drop onto the open point panel, or the picker, through
      `uploadJobFileBytes`; lands in the job's Photos/Videos folder and links.
- [x] Record a voice note in the browser with the existing `AudioRecorder`; the blob becomes a `File`
      and takes the same path.
- [ ] Thumbnails: server-side `sharp` for images (400 px WebP via `normaliseImage`); a client-captured
      poster frame for video; nothing for audio.
- [x] The detail panel: notes, the media grid, `MediaViewer` for full-screen playback, caption edit,
      remove.
- [x] Tests: attach/detach contract, `mediaKindFor` coverage, thumbnail path building.

**Done when:** a point can hold notes, photos, video and audio, and all of it plays.

## Phase 3b — The file panel, and one file to one point

> "we need all of the job files, photos, videos, audio files, etc to be available to us to see in a
> panel next to the map while we are building the interactive map, so that we can assign them to
> points of interest if we want to. We should be able to grab the thumbnail/preview … and drag it to
> a point, or open up a point's panel and it should have a drop box … once a file has been assigned
> to a point, it cannot be assigned to another point. It will still be in the … panel, but it will be
> a bit transparent and marked as already assigned. There will be an option to unassign it which will
> require confirmation … so that I can start placing points and then adding data to them very quickly
> and easily!"

**The panel is a to-do list**, and that is the whole design. Its job is to answer *what have I not
placed yet?* at a glance, which only works if "assigned" is a property of the FILE rather than
something to cross-reference against the points. So the library endpoint returns every file with its
assignment attached, and the exclusivity rule is what keeps the greyed-out state honest: the moment
one photograph can hang on three pins, the panel stops being a list of work left to do.

**The constraint lives in the database, not the route.** Two fast drags are two requests in flight at
once; a check-then-insert passes both and leaves exactly the state that was asked to be impossible. A
partial unique index cannot be raced. The route's check exists for the *sentence* — a constraint can
only say "duplicate key", and what somebody dragging a photo needs to hear is which pin already has
it.

- [x] `seeds/643_job_map_media_one_point.sql` — unique on `job_file_id` among live rows, replacing
      the old per-point index; existing double assignments resolved newest-wins.
- [x] `loadMapLibrary()` — every job file with kind, size, section, a signed URL and `assignedTo`,
      signed in bulk. Measured on a real job: 22 files in 851 ms, one request.
- [x] `GET …/property-map/library` — its own endpoint, so assigning one photo does not reload the
      aerial and its points.
- [x] Attach refuses a taken file with a 409 that names the point holding it, and says the same thing
      when the index wins the race instead.
- [x] Unassign stays a soft delete, so the file is free again the instant the confirmation is
      accepted, and the record of where it was survives.
- [ ] The panel: tiles with thumbnails, kind filter, search, unassigned first, a count of what is
      left to place.
- [ ] Drag a tile onto a pin, a shape, or a list row. A drop box in the point panel that takes both a
      tile and a file from the desktop.
- [ ] Tap-to-assign for touch and keyboard, because drag-and-drop is neither.
- [ ] Assigned tiles: dimmed, badged with the point number, click the badge to go to it, unassign
      behind an inline confirmation.

**Known gap this exposed:** the first real job tried has twenty PDFs and two images, and only images
preview. PDF first-page thumbnails (and video poster frames) are the thumbnail phase below, and this
panel is the reason it matters — a grid of identical document icons is a filing cabinet, not a
to-do list.

## Phase 3c — Previews for the things that are not photographs

> "we need to make it so that we can see the first page thumbnail and poster frames for videos. Each
> item should have the title of the file below it and if the user hovers over the item then a tooltip
> displays the full title. Also, a user should be able to open and view the
> document/picture/video/audio file. Please make sure we can open the dedicated file viewer."

**The browser makes these, the server only keeps them.** A PDF's first page needs a PDF renderer and
a video's poster needs a video decoder; this platform runs on serverless functions with neither, and
adding ffmpeg and poppler to the deployment to save a browser 200 ms is a bad trade. Every browser
that opens this panel already has both — pdf.js is loaded by the file viewer, and a `<video>` seeked
a little way in and painted onto a `<canvas>` is four lines. So the first browser to need a preview
makes it and posts it; everyone after that is handed a signed URL.

`thumb_state` is what stops that becoming a loop: a scan pdf.js cannot open or a codec the browser
will not decode is recorded as `failed`, and never queued again, by anybody.

**The poster is never frame zero.** The first frame of a phone video is usually the lens adjusting,
a black frame, or somebody's boot — `posterTime()` takes 10% in, capped at 1.5 s, and half-way
through a clip shorter than a second.

- [x] `seeds/644_job_file_thumbnails.sql` — `thumb_path`, `thumb_bucket`, `thumb_state`,
      `thumb_updated_at` on `job_files`, with a partial index on the panel's actual question.
- [x] `lib/jobs/file-thumbnails.ts` — what can have a preview, what one may be, where it goes, and
      when to stop asking. 14 tests, most of them about the untrusted edge: SVG refused outright, the
      size capped from the base64 length before anything is decoded into memory.
- [x] `POST …/property-map/thumbnail` — stores a generated preview, or records the failure.
- [x] The library signs and returns generated previews, and reports what still needs one.
- [ ] The browser-side queue: pdf.js page one, video poster frames, two at a time, never blocking
      the panel.
- [ ] The file name under every tile, clamped to two lines, with the full name on hover.
- [ ] Clicking a tile opens the real `FileViewer`, stepping through the panel's current filter.
- [ ] The same viewer from a point's attachments.

## Phase 4 — The interaction the request is really about

- [x] Hover a pin: enlarge (`transform: scale`), a soft glow, the title on a label, and a **preview
      popup** showing the first few thumbnails, the media counts and the first line of the notes.
      Positioned so it never leaves the viewport (clamp like `ModalFrame`).
- [x] Hover a list row: the same highlight on the map pin. Both directions, one state.
- [x] **Display controls over the map**, remembered per person in `localStorage`: **Labels on/off**,
      **Numbers on/off**, and a **type filter** (show only encroachments, only utilities, …). A
      legend of the types present, which doubles as that filter.
- [x] Click: the detail panel opens (side panel on desktop, bottom sheet on mobile).
- [x] Keyboard: Tab through pins, arrows move between them, Enter opens, Escape closes; visible
      focus ring; `prefers-reduced-motion` turns the animations off.
- [x] Responsive: at ≤ 700 px the list becomes a collapsible drawer under the map and the detail
      panel becomes a sheet; the map still fills the width; nothing scrolls sideways.
- [ ] Pan and zoom the aerial, with pins, handles and strokes scaling inversely so they stay a
      constant size on screen. Owner, 2026-09-16: "we need to be able to zoom in on the image and
      zoom out with the scroll wheel." Specifics that matter:
      · the wheel zooms **centred on the cursor** — the thing under the pointer stays under it,
        which is the difference between a map and a slideshow;
      · the wheel listener must be non-passive (`{ passive: false }`) or the page scrolls behind
        the map;
      · panning cannot be plain drag in edit mode, where drag already moves a pin and draws a
        shape — middle-drag, space-drag, or two fingers;
      · double-click zooms, EXCEPT while a path or area is being drawn, where double-click already
        means finish;
      · placement must stay exact at every zoom: `relativeFromClick()` measures the transformed
        image's own rect, so the fractions come out right without unwinding the transform by hand —
        but it has to be checked, at 1× and at 4×, deliberately.
- [ ] Tests: hover/selection reducer, clamping of the popup, reduced-motion CSS present.

**Done when:** it feels good on a desktop and on a phone, and the whole thing works without a mouse.

## Phase 5 — Make it fast, and prove it

- [x] One-request load: the GET returns every signed URL already (thumbnails 2 h, full-size 2 h),
      batch-signed server-side. No per-image round trip, ever.
- [x] Thumbnails everywhere in the grid and popups; full-size only in the viewer.
- [ ] Prefetch: after first paint, warm the full-size media of the selected point and its neighbours;
      `<link rel="prefetch">`/`Image()` for thumbnails; `preload="metadata"` on video.
- [x] Skeletons, not spinners: the map frame, the list rows and the thumbnail tiles have shaped
      placeholders, so the page has a layout before it has data.
- [x] Decode off the main thread (`img.decoding="async"`, `loading="lazy"` below the fold).
- [ ] A budget, written down and checked: **map + 20 points + thumbnails interactive in < 2 s** on a
      warm cache and a normal connection; opening a point's first photo < 300 ms.
- [x] Tests: the GET returns URLs for every media row in one call (no N+1), and the response shape is
      asserted.

**Done when:** the budget is met with a realistic map (20 points, 60 photos, 4 videos).

## Phase 6 — The things that make it a survey tool

- [x] Status (open / resolved / needs attention) with a visible treatment and a filter.
- [x] Search + filter the list (text, type, status, "has video").
- [ ] Reorder points (drag in the list) and renumber.
- [ ] Multiple maps per job: a switcher, rename, delete.
- [ ] Activity: placing/editing/deleting a point writes to the job's activity feed.
- [ ] Tests: filter/sort logic (pure), activity write.

## Phase 7 — Real-world coordinates (optional per map)

- [ ] Georeference: the operator gives two points their lat/long; `affineFromTwoPoints` stores the
      transform on the map row.
- [ ] Every pin then shows its coordinates and offers **Open in Google Maps** / **Directions**.
- [ ] **Drop a pin at my current location** (`navigator.geolocation`) on a georeferenced map.
- [ ] Distance between two selected pins, in feet.
- [ ] Tests: affine round-trip, distance against a known pair.

## Phase 8 — Share it

- [ ] Export a PDF: the aerial with numbered pins, a legend, and the notes per point.
- [ ] Copy a deep link to a specific point (`?point=7`), which opens with it selected.

## Phase 9 — Close out

- [ ] `docs/product/interactive-property-map.md` — the live spec (what it is, how the data is shaped,
      what the pure module owns), linked from the job docs.
- [ ] Full test pass, `npm run build`, merge, deploy, verify on production with a real job.
- [ ] Add the QA items to `docs/planning/QA_CHECKLIST.md` (hover on touch devices, a 40-point map, a
      500 MB video, a map whose aerial was deleted, two people editing at once).
- [ ] Move this doc to `docs/planning/completed/`.

---

## Rules for whoever builds this (including future me)

- **No hex colours in new files** — tokens only. `__tests__/inline-style-hex-ratchet.test.ts` fails
  the build otherwise.
- **Pure logic goes in `lib/jobs/property-map.ts`**, so it can be tested without a browser. Routes
  are tested by reading their source, the way this repo does it.
- **Never copy bytes.** Media attaches by linking a `job_files` row. One file, one place.
- **Every phase ends shippable.** Merge at the end of each phase; do not leave a half-built map on
  `main` behind a flag nobody remembers.
