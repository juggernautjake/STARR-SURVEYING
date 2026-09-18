// Renaming a file where it is listed, on every surface that lists one.
//
// Owner, 2026-09-18: "Please make sure that we can fully rename pictures/videos/files inside of
// projects/jobs and in the interactive map editor too."
//
// Before this, one rename existed and it was reachable from one place: open the file full-screen in
// the shared viewer and click its title. The job people actually do — naming a run of forty photos
// off a phone, in the map panel where they are being placed — could not be done at all.
//
// What these assert is mostly that there is still exactly ONE rename underneath. Three inline
// controls writing three different columns would be the real failure here, and it would not show up
// until somebody renamed a photo on the map and found the job's Files tab still calling it
// IMG_5685.jpg.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fitLabel, MAX_LABEL_LENGTH, checkLabel } from '@/lib/files/labels';
import { applyRename } from '@/lib/files/viewer-model';

const read = (p: string) => readFileSync(p, 'utf8');

describe('a name that has to survive the round trip', () => {
  it('keeps the extension when only the stem is retyped', () => {
    expect(applyRename('IMG_5685.jpg', 'NE corner iron rod')).toBe('NE corner iron rod.jpg');
    expect(applyRename('IMG_5685.jpg', 'plat.pdf'), 'a typed extension wins').toBe('plat.pdf');
  });

  it('trims to the length the server accepts, keeping the extension', () => {
    // applyRename puts the extension back AFTER the box has been filled, which is how a 120
    // character name becomes a 124 character one and gets refused for text nobody can see.
    const long = `${'a'.repeat(MAX_LABEL_LENGTH)}.jpg`;
    const fitted = fitLabel(long);
    expect(fitted.length).toBeLessThanOrEqual(MAX_LABEL_LENGTH);
    expect(fitted.endsWith('.jpg'), 'the extension is what makes it openable').toBe(true);
    // And what comes out is something the route will actually take.
    expect(checkLabel(fitted).ok).toBe(true);
  });

  it('leaves a name that already fits completely alone', () => {
    expect(fitLabel('NE corner iron rod.jpg')).toBe('NE corner iron rod.jpg');
  });

  it('cuts bodily when the "extension" is longer than the whole budget', () => {
    const silly = `x.${'y'.repeat(MAX_LABEL_LENGTH + 10)}`;
    expect(fitLabel(silly).length).toBe(MAX_LABEL_LENGTH);
  });
});

describe('one rename, not one per surface', () => {
  it('the inline control commits on Enter, cancels on Escape and restores a failed save', () => {
    const c = read('app/admin/components/files/InlineRename.tsx');
    expect(c).toContain("if (e.key === 'Enter')");
    expect(c).toContain("if (e.key === 'Escape')");
    // Escape and submit both blur on the way out; without the guard the cancel is undone by the
    // commit that the blur then fires.
    expect(c, 'blur must not undo an Escape').toContain('doneRef');
    expect(c, 'a rejected save puts the old name back').toContain('setDraft(name);');
    expect(c, 'the cap is applied before the request, not after the refusal').toContain('const next = fitLabel(');
  });

  it('the map writes the file’s label — the same field the Files tab writes', () => {
    const page = read('app/admin/jobs/[id]/map/page.tsx');
    expect(page).toContain('/api/admin/jobs/files/${jobFileId}`');
    expect(page, 'the shared field, not a map-local caption').toContain("body: JSON.stringify({ label: next })");
    // A point attachment's id is the media row's, not the file's — renaming by it would rename
    // whatever job file happened to share that uuid, or nothing.
    expect(page).toContain('renameFile(m.jobFileId, next)');
    expect(page).toContain('renameFile(file.id, next)');
  });

  it('the map’s viewer can rename too, and resolves a media id back to its file', () => {
    const page = read('app/admin/jobs/[id]/map/page.tsx');
    expect(page, 'the gap: the viewer used to be handed no capabilities here').toContain('capabilities={editing ? viewerCapabilities : undefined}');
    expect(page).toContain('const jobFileId = fromLibrary?.id ?? media?.jobFileId;');
    expect(page, 'an unresolvable row refuses rather than renaming the wrong file').toContain("throw new Error('That file is renamed where it lives.')");
  });

  it('the job’s Files tab renames through the capability it already had', () => {
    const fe = read('app/admin/components/files/FolderExplorer.tsx');
    expect(fe).toContain('<InlineRename');
    expect(fe, 'the same mountCapabilities rename the viewer uses').toContain('const rename = viewerCapabilities.rename;');
    // A button inside a button is invalid markup, and the browsers that tolerate it fire both
    // handlers on one click — which would open the file every time you went to rename it.
    expect(fe).toContain('The pencil is a SIBLING of the name button');
  });

  it('a rename reaches the mobile app’s copy of the name', () => {
    // `mobile/lib/jobFiles.ts` reads `name` and knows nothing about `label`, so a rename that only
    // wrote `label` was invisible on a phone — which is not a rename.
    const route = read('app/api/admin/jobs/files/[id]/route.ts');
    expect(route).toContain('patch.name = check.value ?? existing.file_name ?? existing.name');
    expect(route, 'and the row has to be read to fall back to').toContain('file_name, name, label');
  });

  it('the map itself can be renamed, which it never could', () => {
    const page = read('app/admin/jobs/[id]/map/page.tsx');
    expect(page).toContain('const renameMap = useCallback');
    expect(page).toContain('onRename={renameMap}');
  });
});

describe('a point can be renamed after it has been named', () => {
  it('the panel heading is the edit, not just a label', () => {
    const page = read('app/admin/jobs/[id]/map/page.tsx');
    expect(page).toContain('const renamePoint = useCallback');
    expect(page).toContain('onRename={(next) => renamePoint(selected.id, next)}');
    // The ordinal in "3. Fence corner" belongs to the map's numbering, so only the title is edited.
    expect(page, 'the bare title, not the numbered label').toContain('name={selected.title}');
  });

  it('moves the Title box below it along, so Save cannot put the old name back', () => {
    const page = read('app/admin/jobs/[id]/map/page.tsx');
    expect(page).toContain('setDraft((d) => (d ? { ...d, title } : d));');
    // The draft is seeded when the SELECTION changes, so a rename on the open point has to say so.
    expect(page).toContain('}, [selectedId]);');
  });

  it('patchPoint reports whether the save landed', () => {
    const page = read('app/admin/jobs/[id]/map/page.tsx');
    // It used to swallow the result, which would have made a failed rename look like it worked.
    expect(page).toContain("const res = await patchPoint(pointId, { title }, 'Point renamed.');");
    expect(page).toContain("if (!res) throw new Error('rename failed');");
  });

  it('a title is not a file name — no extension is welded onto it', () => {
    // "Fence corner 3.5m offset" has a "." in it. Treated as a file, applyRename decides the
    // extension is ".5m offset" and appends it to whatever is typed next.
    expect(applyRename('Fence corner 3.5m offset', 'NE pipe'), 'why titles opt out')
      .toBe('NE pipe.5m offset');
    const page = read('app/admin/jobs/[id]/map/page.tsx');
    const control = read('app/admin/components/files/InlineRename.tsx');
    expect(control).toContain('preserveExtension = true');
    expect(control).toContain('preserveExtension ? applyRename(name, draft) : sanitizeFilename(draft, name)');
    // Both prose titles on this page opt out; the file tiles do not.
    expect(page.match(/preserveExtension=\{false\}/g)?.length, 'the point title and the map title').toBe(2);
  });
});
