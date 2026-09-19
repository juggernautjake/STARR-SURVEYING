# GPS-tagged capture from the phone — plan

Owner, 2026-09-19: "would it be possible to use my phone in the starr surveying app to record videos
and photos and track the location of the phone at the time the picture or video is taken? … if we
can capture the lat/long information whenever we snap a picture, we can use that to automatically
create a point on the interactive map and upload that picture immediately to that point … For a
video … every few seconds the lat/long is captured while the video capture is happening … it would
be cool to see as the video plays, a little node on the path moving along in relation to where we
were when filming. If we rewinded, then the little node would go backwards."

Status: **designed, not built.** Written down now because the answers below settle a data-model
question that is expensive to get wrong later.

## It is all possible, and the hard part exists

`mobile/` is Expo and already carries `expo-location`, `expo-camera`, `expo-av`,
`expo-media-library` and `expo-file-system`. More importantly `mobile/lib/locationTracker.ts`
already does background GPS at 30s-or-50m, writes samples into local SQLite, and lets PowerSync's
CRUD queue replay them when reception returns. Offline capture on a site with no signal is the
expensive problem here and it is already solved for a different purpose.

The map side is ready too: `job_map_points` stores `geometry` of `point` / `path` / `area` / `fov`
with `vertices`, and `job_map_point_media` attaches files to a point.

## The decision that shapes the schema

Owner, on moving captures between jobs: "it could be that a user is clocked into the wrong job, or
they are in the wrong job profile, and they record some videos and images without realizing… we
need it so that we can move files/photos/videos easily to other jobs in the same project or other
projects and still retain the lat/long and other data for the capture."

**Therefore capture data belongs to the FILE, not to the map point.**

If the fix lives only on `job_map_points`, moving a file to another job loses it — the point stays
behind with the coordinates and the photograph arrives somewhere else naked. So:

- the fix (and, for video, the whole track) is stored against the file row;
- the map point is DERIVED from that;
- moving the file to another job carries its coordinates with it, and the point can be recreated in
  the new job from data the file still holds.

Sketch, to be argued properly when it is built:

```sql
-- One row per captured file. The file is the subject; the point is a consequence.
create table job_file_captures (
  job_file_id uuid primary key references job_files(id) on delete cascade,
  captured_at timestamptz not null,
  lat double precision, lng double precision,
  accuracy_m double precision,
  -- Video only: [{ t: seconds-into-clip, lat, lng, acc }]. Null for a still.
  track jsonb,
  device text, org_id uuid
);
```

## How the three pieces work

**Photo → point.** Fix at the shutter, uploaded with the file. Creates a `point` and attaches the
media. The person types the title and any notes before sending, as they asked.

**Video → path.** Sample while recording. If the track has meaningful spread it becomes a `path`
whose vertices are the track; if they stood still it is a single `point`.

**The node moving along the path.** Driven off the `<video>` element's `currentTime`, interpolating
between samples — NOT off a timer running alongside playback. Rewind, scrub and pause then all work
for free, because the position is a function of playback time rather than something animated beside
it. This is the cheap part and it is why the track stores `t` per sample rather than only a shape.

## The precision problem, which is the real one

Phone GPS is 3–5 m at best and 10 m or worse under canopy. The owner's 15 ft is ≈4.6 m, which sits
AT the noise floor: a phone lying still on a tailgate will appear to wander that far. Taken
literally, a video shot standing still would draw a bird's nest of invented movement.

So a sample is kept only when it is further than BOTH 15 ft and the accuracy the phone reported for
that fix, and fixes worse than a threshold are dropped entirely. First and last samples are always
kept. That turns "walked 20 feet" into a clean segment and "stood still for three minutes" into one
point, which is what was actually asked for.

This belongs in a pure, tested module — it is arithmetic on a list of fixes and should not need a
phone to verify.

## Answers already given

- **When it captures:** automatic while clocked in; when NOT clocked in, ask per capture.
- **Which job:** the job they are clocked into. Also: opening a job's interactive map and recording
  from there assigns to that job whether or not they are clocked in — because "sometimes employees
  are not clocked into a specific job, so they will need to be able to go to that job profile and
  add images there while generally clocked in."
- **After sync:** the point appears on the map straight away. Rename, drag-to-move and layers
  already exist for tidying up, so a review queue would be a second inbox for no gain.

## Still open

- Whether a moved file recreates its point automatically in the new job, or offers to.
- What happens to the original point when its last file moves away — delete, or keep as an empty
  point somebody placed.
- Sampling interval while recording (1s and filter, most likely) and what it costs in battery.

## The capture dialog (owner, 2026-09-19, follow-up)

"we will likely need a well formatted dialogue box where we can record informaiton about the point
and stuff, and when we are not clocked in we need to be able to confirm that we want to record the
lat/long position data for the capture or not."

One sheet, shown after the shutter and before the upload, carrying:

- **the picture or the clip**, large enough to tell which one this is;
- **a title** — the point's name. This is the field the whole dialog exists for, so it is first and
  focused;
- **notes** — the same free text a point already has on the map;
- **point type**, matching the map's existing types rather than inventing a second vocabulary;
- **where it is**: the fix, its accuracy in feet, and the job it will land on, all stated rather
  than implied. A capture that is about to attach to the wrong job should be visibly about to do
  that BEFORE it is sent, not discovered on the map afterwards.

### Consent, when not clocked in

While clocked in, the location rides along automatically — that is the existing privacy contract
and the crew have already agreed to it by clocking in.

While NOT clocked in the dialog asks, per capture, with the toggle defaulting to OFF. The
asymmetry is the point: being off the clock is exactly when somebody has not agreed to be located,
so the safe answer has to be the one that happens when they tap past it without reading.

Declining must still let the capture through — a photograph with no point is a photograph in the
job's Photos folder, which is worth having. The dialog says which of the two is about to happen.

### It still has to be movable afterwards

Whatever the dialog collects is stored against the FILE, per the data-model note above, so a
capture that went to the wrong job can be moved to the right one and keep its coordinates, its
accuracy and its track.
