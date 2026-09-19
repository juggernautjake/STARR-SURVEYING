// The interactive property map: the rules that decide where a pin sits, what number it wears, what
// kind of thing is attached to it, and what a caller— sorry, a viewer — can find.
//
// Owner, 2026-09-16: "For each job, I want it so that we can create an interactive map … place
// points of interest on the map image … with that dot we can attach meta data."
// Spec: docs/planning/in-progress/interactive-property-map-2026-09-16.md
//
// The interesting failures in a feature like this are all arithmetic and ordering: a pin that moves
// when the image is rescanned, two points both called "7", a photo that shows up as a document, a
// delete that leaves a hole in the numbering. None of that needs a browser to go wrong, so none of
// it is tested through one.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  clampToImage, relativeFromClick, pinStyle, toImagePixels, nextOrdinal, renumber, reorder,
  sortPoints, pointLabel, mediaKindFor, wantsThumbnail, mediaSummary, sortMedia, filterPoints,
  typesInUse, pointType, isKnownPointType, pointStatus, affineFromTwoPoints, pixelToLatLng,
  distanceFeet, mapsHref, POINT_TYPES, POINT_STATUSES, DEFAULT_POINT_TYPE,
  type MapPoint, type PointMedia,
} from '@/lib/jobs/property-map';

const read = (p: string) => readFileSync(p, 'utf8');

const media = (over: Partial<PointMedia> = {}): PointMedia => ({
  id: 'm1', pointId: 'p1', jobFileId: 'f1', kind: 'image', name: 'IMG_4471.JPG', caption: null,
  ordinal: 1, url: null, thumbUrl: null, sizeBytes: null, mimeType: null, ...over,
});

const point = (over: Partial<MapPoint> = {}): MapPoint => ({
  id: 'p1', mapId: 'map1', ordinal: 1, title: 'Pipe found', notes: null, x: 0.5, y: 0.5,
  pointType: 'monument_found', status: 'open', layerId: null, geometry: 'point', vertices: [],
  bearingDeg: null, fovDeg: null, fovRadius: null, lat: null, lng: null, media: [],
  createdBy: null, createdAt: '2026-09-16T00:00:00Z', updatedAt: '2026-09-16T00:00:00Z', ...over,
});

describe('where a pin sits', () => {
  it('is a fraction of the image, so re-scanning the aerial does not move forty pins', () => {
    // 0.25/0.75 means a quarter across and three quarters down, whatever the file or the screen is.
    expect(pinStyle({ x: 0.25, y: 0.75 })).toEqual({ left: '25%', top: '75%' });
    expect(toImagePixels({ x: 0.25, y: 0.75 }, 4000, 3000)).toEqual({ x: 1000, y: 2250 });
    // …and the same fractions on a bigger re-scan land on the same feature.
    expect(toImagePixels({ x: 0.25, y: 0.75 }, 8000, 6000)).toEqual({ x: 2000, y: 4500 });
  });

  it('clamps a click just past the edge instead of rejecting it', () => {
    // Somebody aiming at the corner pin. Dropping this would feel broken.
    expect(clampToImage({ x: -0.02, y: 1.04 })).toEqual({ x: 0, y: 1 });
    expect(clampToImage({ x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 });
  });

  it('survives the nonsense a layout produces before it has laid out', () => {
    expect(clampToImage({ x: NaN, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 });
    expect(clampToImage({ x: Infinity, y: -Infinity })).toEqual({ x: 0.5, y: 0.5 });
    // A zero-sized box: the image has not loaded. Answer the centre, never divide by zero.
    expect(relativeFromClick(100, 100, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0.5, y: 0.5 });
  });

  it('turns a click on the image into that fraction', () => {
    const box = { left: 100, top: 50, width: 800, height: 600 };
    expect(relativeFromClick(500, 350, box)).toEqual({ x: 0.5, y: 0.5 });
    expect(relativeFromClick(100, 50, box)).toEqual({ x: 0, y: 0 });
    expect(relativeFromClick(900, 650, box)).toEqual({ x: 1, y: 1 });
  });

  it('rounds far enough to be exact and no further', () => {
    const p = clampToImage({ x: 1 / 3, y: 2 / 3 });
    expect(p.x).toBe(0.333333);
    expect(String(p.y).length, 'not fifteen decimals of noise in every payload').toBeLessThan(10);
  });
});

describe('the numbers on the pins', () => {
  it('a new point takes one past the highest, never a freed number', () => {
    // Reusing 4 would silently rename "point 4" in every note, caption and phone call about it.
    expect(nextOrdinal([])).toBe(1);
    expect(nextOrdinal([{ ordinal: 1 }, { ordinal: 2 }, { ordinal: 3 }])).toBe(4);
    expect(nextOrdinal([{ ordinal: 1 }, { ordinal: 7 }]), 'the gap is not filled').toBe(8);
  });

  it('a delete in the middle closes the gap, and only the rows that move are written', () => {
    const after = [{ id: 'a', ordinal: 1 }, { id: 'c', ordinal: 3 }, { id: 'd', ordinal: 4 }];
    expect(renumber(after)).toEqual([{ id: 'c', ordinal: 2 }, { id: 'd', ordinal: 3 }]);
  });

  it('deleting the last point writes nothing at all', () => {
    expect(renumber([{ id: 'a', ordinal: 1 }, { id: 'b', ordinal: 2 }])).toEqual([]);
  });

  it('dragging a point up the list renumbers everything it passed', () => {
    const list = [{ id: 'a', ordinal: 1 }, { id: 'b', ordinal: 2 }, { id: 'c', ordinal: 3 }];
    expect(reorder(list, 'c', 0)).toEqual([{ id: 'c', ordinal: 1 }, { id: 'a', ordinal: 2 }, { id: 'b', ordinal: 3 }]);
    expect(reorder(list, 'a', 99), 'past the end lands at the end').toEqual([{ id: 'b', ordinal: 1 }, { id: 'c', ordinal: 2 }, { id: 'a', ordinal: 3 }]);
    expect(reorder(list, 'nope', 0), 'a point that is not there moves nothing').toEqual([]);
  });

  it('the list is always in number order, and the label reads like a legend entry', () => {
    const out = sortPoints([point({ id: 'b', ordinal: 3 }), point({ id: 'a', ordinal: 1 })]);
    expect(out.map((p) => p.ordinal)).toEqual([1, 3]);
    expect(pointLabel({ ordinal: 3, title: 'Pipe at the NE corner' })).toBe('3. Pipe at the NE corner');
  });
});

describe('what kind of thing is attached', () => {
  it('reads the MIME type when there is one', () => {
    expect(mediaKindFor('image/jpeg')).toBe('image');
    expect(mediaKindFor('video/mp4')).toBe('video');
    expect(mediaKindFor('audio/webm;codecs=opus'), 'the fieldbook recorder').toBe('audio');
    expect(mediaKindFor('application/pdf')).toBe('document');
  });

  it('falls back to the extension for what phones actually produce', () => {
    // An iPhone video arrives as video/quicktime; a HEIC photo often arrives with no type at all.
    expect(mediaKindFor('', 'IMG_4471.HEIC')).toBe('image');
    expect(mediaKindFor(null, 'IMG_4472.MOV')).toBe('video');
    expect(mediaKindFor(undefined, 'note.m4a')).toBe('audio');
    expect(mediaKindFor('application/octet-stream', 'corner.jpg')).toBe('image');
    expect(mediaKindFor(null, 'deed.pdf')).toBe('document');
  });

  it('only images and video get a generated preview', () => {
    expect(wantsThumbnail('image')).toBe(true);
    expect(wantsThumbnail('video')).toBe(true);
    expect(wantsThumbnail('audio'), 'a waveform is not worth generating').toBe(false);
    expect(wantsThumbnail('document')).toBe(false);
  });

  it('summarises a point in the words a person would use', () => {
    expect(mediaSummary([])).toBe('No attachments yet');
    expect(mediaSummary([media()])).toBe('1 photo');
    expect(mediaSummary([media(), media({ id: 'm2' }), media({ id: 'm3', kind: 'audio' })])).toBe('2 photos, 1 voice note');
    expect(mediaSummary([media({ kind: 'video' }), media({ id: 'm2', kind: 'document' })])).toBe('1 video, 1 file');
  });

  it('shows photos first, because that is what people scan', () => {
    const out = sortMedia([
      media({ id: 'd', kind: 'document', ordinal: 1 }),
      media({ id: 'a2', kind: 'audio', ordinal: 2 }),
      media({ id: 'i2', kind: 'image', ordinal: 2 }),
      media({ id: 'i1', kind: 'image', ordinal: 1 }),
      media({ id: 'v', kind: 'video', ordinal: 1 }),
    ]);
    expect(out.map((m) => m.id)).toEqual(['i1', 'i2', 'v', 'a2', 'd']);
  });
});

describe('the kinds of point, which is what colours the map', () => {
  it('has the ones the owner asked for, and generic is what a new point gets', () => {
    // "there should be a generic point of interest, but there can be points of interest related to
    //  buildings, utilities, fences, property boundaries, street view, and whatever you can think of.
    //  The default for a new point of interest is the generic kind."
    expect(DEFAULT_POINT_TYPE).toBe('generic');
    expect(pointType(undefined).id, 'anything unrecognised renders as generic').toBe('generic');
    for (const id of ['generic', 'building', 'utility', 'fence', 'boundary', 'street_view']) {
      expect(POINT_TYPES.map((t) => t.id), id).toContain(id);
    }
  });

  it('every type carries a colour token, an icon and a reason to pick it', () => {
    for (const t of POINT_TYPES) {
      expect(t.token, t.id).toMatch(/^--map-pin-[a-z]+$/);
      expect(t.icon.length, t.id).toBeGreaterThan(2);
      expect(t.label.length, t.id).toBeGreaterThan(2);
      expect(t.hint.length, `${t.id} needs to say what it is for`).toBeGreaterThan(20);
    }
    expect(new Set(POINT_TYPES.map((t) => t.token)).size, 'two types sharing a colour is a bug').toBe(POINT_TYPES.length);
  });

  it('a type written by a newer deploy renders as generic instead of vanishing', () => {
    expect(isKnownPointType('cattle_guard')).toBe(false);
    expect(pointType('cattle_guard').id).toBe('generic');
  });

  it('the legend shows only what is actually on the map', () => {
    const used = typesInUse([point({ pointType: 'fence' }), point({ pointType: 'fence' }), point({ pointType: 'utility' })]);
    expect(used.map((t) => t.id)).toEqual(['utility', 'fence']);
    expect(typesInUse([]), 'an empty map has no legend').toEqual([]);
  });

  it('status falls back to open rather than to nothing', () => {
    expect(pointStatus('attention')).toBe('attention');
    expect(pointStatus('banana')).toBe('open');
    expect(POINT_STATUSES.map((s) => s.id)).toEqual(['open', 'resolved', 'attention']);
  });
});

describe('finding a point on a crowded map', () => {
  const points = [
    point({ id: 'a', ordinal: 1, title: 'Pipe at NE corner', pointType: 'monument_found', media: [media()] }),
    point({ id: 'b', ordinal: 2, title: 'Neighbour shed over the line', pointType: 'encroachment', status: 'attention', notes: 'About two feet across' }),
    point({ id: 'c', ordinal: 7, title: 'Gate', pointType: 'access', media: [media({ kind: 'video', caption: 'drive in from Briggs Road' })] }),
  ];

  it('matches the number, the title, the notes, the type and a caption', () => {
    expect(filterPoints(points, { text: '7' }).map((p) => p.id)).toEqual(['c']);
    expect(filterPoints(points, { text: 'pipe' }).map((p) => p.id)).toEqual(['a']);
    expect(filterPoints(points, { text: 'two feet' }).map((p) => p.id)).toEqual(['b']);
    expect(filterPoints(points, { text: 'encroach' }).map((p) => p.id)).toEqual(['b']);
    expect(filterPoints(points, { text: 'briggs' }).map((p) => p.id)).toEqual(['c']);
  });

  it('filters by type, by status, and by whether anything is attached', () => {
    expect(filterPoints(points, { types: ['access'] }).map((p) => p.id)).toEqual(['c']);
    expect(filterPoints(points, { statuses: ['attention'] }).map((p) => p.id)).toEqual(['b']);
    expect(filterPoints(points, { withMediaOnly: true }).map((p) => p.id)).toEqual(['a', 'c']);
    expect(filterPoints(points, {}).length, 'no filter is everything').toBe(3);
  });
});

describe('real-world coordinates, when somebody bothers to tie the map down', () => {
  // Two corners of a property near Belton, roughly north-up.
  const geo = {
    a: { x: 0.1, y: 0.1, lat: 31.0700, lng: -97.4700 },
    b: { x: 0.9, y: 0.9, lat: 31.0600, lng: -97.4600 },
  };

  it('a pin on an anchor reports that anchor, to the metre', () => {
    const at = pixelToLatLng({ x: 0.1, y: 0.1 }, geo)!;
    expect(at.lat).toBeCloseTo(31.07, 5);
    expect(at.lng).toBeCloseTo(-97.47, 5);
  });

  it('a pin between them interpolates', () => {
    const mid = pixelToLatLng({ x: 0.5, y: 0.5 }, geo)!;
    expect(mid.lat).toBeCloseTo(31.065, 4);
    expect(mid.lng).toBeCloseTo(-97.465, 4);
  });

  it('refuses two anchors too close together instead of answering the Atlantic', () => {
    const useless = { a: { x: 0.5, y: 0.5, lat: 31, lng: -97 }, b: { x: 0.505, y: 0.9, lat: 31.1, lng: -97.1 } };
    expect(affineFromTwoPoints(useless)).toBeNull();
    expect(pixelToLatLng({ x: 0.2, y: 0.2 }, useless)).toBeNull();
    expect(pixelToLatLng({ x: 0.2, y: 0.2 }, null), 'a map nobody georeferenced').toBeNull();
  });

  it('measures between two pins in feet, and says nothing when it cannot', () => {
    const d = distanceFeet({ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }, geo)!;
    // ~0.01° of latitude is about 3,640 ft; the diagonal adds the longitude leg.
    expect(d).toBeGreaterThan(4000);
    expect(d).toBeLessThan(6000);
    expect(distanceFeet({ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }, null)).toBeNull();
  });

  it('hands a phone something it will open', () => {
    expect(mapsHref(31.07, -97.47)).toBe('https://www.google.com/maps/search/?api=1&query=31.07,-97.47');
  });
});

describe('the file panel beside the map, and one file on as many points as it belongs', () => {
  // Owner, 2026-09-16: "we need all of the job files, photos, videos, audio files, etc to be
  // available to us to see in a panel next to the map … There will be an option to unassign it which
  // will require confirmation."
  //
  // Owner, 2026-09-18, REVERSING the one-file-one-point rule of two days earlier: "We also need to
  // be able to assign files and pictures and videos to multiple different points if we want to."
  // seeds/643 made it a database rule; seeds/646 takes it back out. One photograph down a fence line
  // genuinely shows the corner post AND the gate AND the encroachment.
  const old = read('seeds/643_job_map_media_one_point.sql');
  const seed = read('seeds/646_job_map_media_many_points.sql');
  const media = read('app/api/admin/jobs/[id]/property-map/media/route.ts');
  const server = read('lib/jobs/property-map-server.ts');

  it('the one-point rule is gone from the database, not just from the route', () => {
    expect(seed).toContain('DROP INDEX IF EXISTS public.uq_job_map_point_media_one_point');
    expect(old, 'and 643 is what it is undoing').toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_job_map_point_media_one_point');
  });

  it('the same file on the SAME point is still refused — that is a double-click', () => {
    expect(seed).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_job_map_point_media_file');
    expect(seed).toContain('ON public.job_map_point_media (point_id, job_file_id) WHERE deleted_at IS NULL');
    expect(media).toContain("'That file is already on this point.'");
    expect(media).toContain("code: 'already_on_point'");
  });

  it('the duplicate check asks about THIS point, not about any point', () => {
    // The trap: asking "is this file on any point" with .maybeSingle() stops returning a row the
    // moment a file legitimately hangs on two, so the check silently passes and the only thing left
    // refusing a genuine double-click is a raw "duplicate key" nobody can read.
    expect(media).toContain(".eq('job_file_id', body.job_file_id).eq('point_id', point.id)");
    expect(media, 'the old job-wide refusal is gone').not.toContain("code: 'already_assigned'");
  });

  it('unassigning frees the file at once — that is what the confirmation promises', () => {
    // A soft delete, and the unique index only counts live rows.
    expect(media).toContain("deleted_at: new Date().toISOString()");
  });

  it('the panel gets every file with its thumbnail and every point that has it, in one request', () => {
    expect(server).toContain('export async function loadMapLibrary');
    expect(server, 'signed in bulk like the map itself').toMatch(/signAll\(toSign\)/);
    expect(server, 'assignment arrives as a property of the file').toContain('assignedTo');
    expect(server, 'and it names each point, so the tile can say "On 2, 7"').toContain('ordinal: point?.ordinal ?? 0');
    expect(server, 'many per file now, in point order').toContain('.sort((x, y) => x.ordinal - y.ordinal)');
    const route = read('app/api/admin/jobs/[id]/property-map/library/route.ts');
    expect(route).toContain('loadMapLibrary(params.id, mapId)');
    expect(route, 'admin only, like everything else on a job').toContain('isAdmin(session.user.roles)');
  });

  it('the panel still answers "what have I not placed yet?"', () => {
    // 643's argument for one-file-one-point was that the greyed-out state is a lie once a file can
    // hang on three pins. The answer that survives: a file with ANY assignment is placed.
    const page = read('app/admin/map/page.tsx');
    expect(page).toContain('library.filter((f) => f.assignedTo.length === 0).length');
    expect(page).toContain('if (unplacedOnly && f.assignedTo.length > 0) return false;');
  });

  it('an assigned file can be dragged again, and taking it off has to say off WHICH point', () => {
    const page = read('app/admin/map/page.tsx');
    const tiles = read('app/admin/map/components/Tiles.tsx');
    // The drag used to be refused outright for an assigned file.
    expect(page).toContain("if (!editing) { e.preventDefault(); return; }");
    expect(page).toContain("at: LibraryFile['assignedTo'][number]");
    expect(tiles, 'the confirm becomes the list when there is more than one').toContain("'Take it off which point?'");
  });

  it('is its own endpoint, so assigning one photo does not reload the aerial', () => {
    const route = read('app/api/admin/jobs/[id]/property-map/library/route.ts');
    expect(route).toMatch(/deliberately NOT folded into the map/);
  });
});

describe('a person can actually find it', () => {
  // Owner, 2026-09-16: "where is the button to create the interactive map? Please make sure it is
  // easy to find in the files and in the job … I am not seeing how to do that."
  //
  // It shipped as a tab — one of eight — which is the same mistake the Files tab made in August and
  // got fixed the same way. Four doors now, and this test is what keeps them open.
  const job = read('app/admin/jobs/[id]/page.tsx');

  it('is a header action, visible from every tab', () => {
    expect(job).toContain('data-testid="job-property-map-header"');
    expect(job, 'and it says which of the two things it does').toMatch(/propertyMap\?\.exists \? 'Interactive map' : 'Create interactive map'/);
  });

  it('is at the top of the job’s files, and in the Photos folder where the question comes up', () => {
    expect(job).toContain('data-testid="job-property-map-files-btn"');
    expect(job).toContain('data-testid="job-property-map-photos-btn"');
    expect(job, 'the owner’s own words for the two states').toMatch(/View Interactive Map' : 'Create Interactive Map/);
  });

  it('still has its own tab', () => {
    expect(job).toContain("key: 'propertymap'");
    expect(job).toContain("label: 'Property Map'");
  });

  it('knows whether a map exists before you open its tab, or the header would lie', () => {
    expect(job).toMatch(/activeTab === 'propertymap' \|\| activeTab === 'files' \|\| activeTab === 'overview'/);
    expect(job, 'the summary endpoint exists so this costs nothing').toContain('property-map?summary=1');
  });
});

describe('the schema and the routes agree with the module', () => {
  const seed = read('seeds/641_job_property_maps.sql');

  it('stores fractions, not pixels, and says why', () => {
    expect(seed).toContain('x           double precision NOT NULL CHECK (x >= 0 AND x <= 1)');
    expect(seed).toMatch(/FRACTIONS, NOT PIXELS/);
  });

  it('numbers cannot collide on one map', () => {
    expect(seed).toContain('uq_job_map_points_ordinal');
    expect(seed).toMatch(/WHERE deleted_at IS NULL/);
  });

  it('media links a job file rather than copying it', () => {
    expect(seed).toContain('job_file_id   uuid NOT NULL REFERENCES public.job_files(id)');
    expect(seed).toMatch(/LINKED, NEVER COPIED/);
    expect(seed, 'and the same file cannot hang on one point twice').toContain('uq_job_map_point_media_file');
  });

  it('a point always has a type, defaulting to generic', () => {
    expect(seed).toContain("point_type  text NOT NULL DEFAULT 'generic'");
  });

  it('every table denies direct access — reads and writes go through the API', () => {
    for (const t of ['job_property_maps', 'job_map_points', 'job_map_point_media']) {
      expect(seed, t).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY;`));
    }
  });

  it('the map loads in ONE request, with every URL already signed', () => {
    const server = read('lib/jobs/property-map-server.ts');
    expect(server, 'signed in bulk, per bucket').toContain('createSignedUrls');
    expect(server, 'long enough to scrub a video without the link dying').toContain('60 * 60 * 2');
    expect(server, 'a bucket that will not sign must not fail the map').toContain('could not sign');
  });

  it('the routes check that the map and the file belong to this job', () => {
    const points = read('app/api/admin/jobs/[id]/property-map/points/route.ts');
    expect(points).toContain('That map is not on this job.');
    const media = read('app/api/admin/jobs/[id]/property-map/media/route.ts');
    expect(media).toContain('That file does not belong to this job.');
    // Detaching must never delete the file itself — it is the job's, not the map's.
    expect(media).toMatch(/Detach only/);
  });

  it('a renumber after a delete cannot trip the unique index halfway through', () => {
    const points = read('app/api/admin/jobs/[id]/property-map/points/route.ts');
    expect(points, 'park on negatives first, then land').toContain('ordinal: -m.ordinal');
  });
});
