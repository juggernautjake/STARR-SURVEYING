// One file, one name, wherever you look at it.
//
// Owner, 2026-09-19: "if we rename a photo or video or any files in the interactive map interface,
// those same files should also be renamed in the folders for that job … I want them to be synced so
// that if I change a files name one place, it will change everywhere."
//
// The sync is not a feature that runs; it is a property of there being ONE column. Every surface
// writes `job_files.label` and every surface reads `displayName()`, which prefers it. Nothing
// copies a name from one place to another, so there is nothing to fall out of step.
//
// That property is invisible in the code — it is four files agreeing — which is exactly the kind of
// thing that gets broken by a reasonable-looking change somewhere else. Hence these tests.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { displayName, originalName } from '@/lib/jobs/file-storage';

const read = (p: string) => readFileSync(p, 'utf8');

describe('the name a file is shown by', () => {
  const row = (o: Record<string, unknown>) => o as never;

  it('is the chosen name when there is one', () => {
    expect(displayName(row({ label: 'Building 14 Video.mp4', file_name: 'IMG_5669.mp4', name: 'IMG_5669.mp4' })))
      .toBe('Building 14 Video.mp4');
  });

  it('falls back to what was uploaded when nobody has renamed it', () => {
    expect(displayName(row({ label: null, file_name: 'IMG_5719.HEIC', name: null }))).toBe('IMG_5719.HEIC');
    expect(displayName(row({ label: '   ', file_name: 'IMG_5719.HEIC' })), 'blank is not a name').toBe('IMG_5719.HEIC');
  });

  it('keeps the uploaded name separately, for the download', () => {
    // Renaming is a display concern. The bytes are still found by `storage_path`, and a download
    // should arrive as the thing the camera produced unless somebody chose otherwise.
    const r = row({ label: 'Building 14 Video.mp4', file_name: 'IMG_5669.mp4' });
    expect(displayName(r)).toBe('Building 14 Video.mp4');
    expect(originalName(r)).toBe('IMG_5669.mp4');
  });
});

describe('every surface writes the same column', () => {
  it('the interactive map renames the file, not something local to the map', () => {
    const map = read('app/admin/map/page.tsx');
    expect(map).toContain("`/api/admin/jobs/files/${fileId}`");
    expect(map).toContain("body: JSON.stringify({ label: next })");
  });

  it('a file on a point renames the file behind it, by its job file id', () => {
    // The point tile holds a `job_map_point_media` row; renaming THAT would rename one placement of
    // the file and leave the file itself alone, which is the divergence this whole test file exists
    // to prevent.
    const map = read('app/admin/map/page.tsx');
    expect(map).toContain('onRename={(next) => renameFile(m.jobFileId, next)}');
  });

  it('the job folders rename the same column through the same route', () => {
    const adapter = read('lib/files/adapters/mount.ts');
    expect(adapter).toContain("await patchJson(`/api/admin/jobs/files/${s.id}`, { label:");
  });

  it('the route writes the mobile app’s copy of the name too', () => {
    // `name` is the column the phone reads; it knows nothing about `label`. A rename that did not
    // touch it would be invisible on a phone, which is not a rename.
    const route = read('app/api/admin/jobs/files/[id]/route.ts');
    expect(route).toContain('patch.label = check.value;');
    expect(route).toContain('patch.name = check.value ?? existing.file_name ?? existing.name');
  });

  it('the route refuses to touch how the bytes are found', () => {
    const route = read('app/api/admin/jobs/files/[id]/route.ts');
    for (const col of ['storage_path', 'storage_bucket']) {
      expect(route.includes(`patch.${col}`), `${col} must not be part of a rename`).toBe(false);
    }
  });
});

describe('every surface reads the same column', () => {
  it('the job folders show the chosen name', () => {
    const mounts = read('lib/files/mounts.ts');
    expect(mounts).toContain('name: displayName(r)');
    expect(mounts, 'and it is selected, or it could not be shown').toContain('label');
  });

  it('the map library shows the chosen name', () => {
    const server = read('lib/jobs/property-map-server.ts');
    expect(server).toContain('displayName(f)');
  });

  it('a point’s own caption never stands in for the file’s name', () => {
    // The bug this caught: the tile showed `caption || name` while the pencil next to it renamed
    // the FILE. With a caption set the two disagreed for good — the folders and the library showed
    // the new name and this one tile showed the old caption, so the rename looked broken.
    const tiles = read('app/admin/map/components/Tiles.tsx');
    expect(tiles, 'the name is the name').not.toContain('media.caption || media.name');
    expect(tiles, 'a caption is still shown, as a note').toContain('media.caption && <span className="pmap__tile-caption"');

    const map = read('app/admin/map/page.tsx');
    expect(map, 'and the viewer titles it by the file too').not.toContain('name: m.caption || m.name');
  });
});
