// __tests__/admin/employee-profile-ep4.test.ts
//
// Slice EP4 — "About me" gallery: migration + API + ProfilePanel
// card.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Migration 312_employee_images.sql', () => {
  const SQL = read('seeds/312_employee_images.sql');

  it('creates the employee_images table with the contract columns', () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS public\.employee_images/);
    expect(SQL).toMatch(/user_email\s+TEXT NOT NULL/);
    expect(SQL).toMatch(/image_url\s+TEXT NOT NULL/);
    expect(SQL).toMatch(/storage_path\s+TEXT NOT NULL/);
    expect(SQL).toMatch(/caption\s+TEXT/);
    expect(SQL).toMatch(/sort_order\s+INTEGER NOT NULL DEFAULT 0/);
  });

  it('indexes by user_email and (user_email, sort_order)', () => {
    expect(SQL).toMatch(/idx_employee_images_user[\s\S]*?\(user_email\)/);
    expect(SQL).toMatch(/idx_employee_images_user_sort[\s\S]*?\(user_email, sort_order\)/);
  });
});

describe('API /api/admin/profile/images (EP4)', () => {
  const SRC = read('app/api/admin/profile/images/route.ts');

  it('targets the public user-gallery bucket with a 10MB cap', () => {
    expect(SRC).toMatch(/const BUCKET = 'user-gallery'/);
    expect(SRC).toMatch(/MAX_BYTES = 10 \* 1024 \* 1024/);
  });

  it('limits captions to 280 chars', () => {
    expect(SRC).toMatch(/MAX_CAPTION_LEN = 280/);
    expect(SRC).toMatch(/t\.slice\(0, MAX_CAPTION_LEN\)/);
  });

  it("GET scopes non-admins to their own gallery", () => {
    expect(SRC).toMatch(/!isAdmin\(session\.user\.roles\) && email !== session\.user\.email/);
  });

  it('POST decodes the data URL, restricts mime, and writes a public URL into image_url', () => {
    expect(SRC).toMatch(/body\.dataUrl\.match\(\/\^data:\(\[\^;\]\*\);base64,\(\.\*\)\$\/s\)/);
    expect(SRC).toMatch(/!ALLOWED_MIMES\.has\(mime\)/);
    expect(SRC).toMatch(/image_url: publicUrl/);
  });

  it('POST defaults sort_order to one past the user\'s current top', () => {
    expect(SRC).toMatch(/\.order\('sort_order', \{ ascending: false \}\)/);
    expect(SRC).toMatch(/sortOrder = topSort \+ 1/);
  });

  it('POST rolls back the storage upload if the DB insert fails', () => {
    expect(SRC).toMatch(/if \(error\) \{\s*\n\s*await supabaseAdmin\.storage\.from\(BUCKET\)\.remove\(\[storagePath\]\)/);
  });

  it('DELETE verifies ownership before pruning + removing', () => {
    expect(SRC).toMatch(/ownerEmail !== session\.user\.email && !isAdmin\(session\.user\.roles\)/);
    expect(SRC).toMatch(/\.from\(BUCKET\)\.remove\(\[\(row as \{ storage_path: string \}\)\.storage_path\]\)/);
  });
});

describe('ProfilePanel — gallery card (EP4)', () => {
  const SRC = read('app/admin/profile/ProfilePanel.tsx');

  it('holds images + fetchImages wiring', () => {
    expect(SRC).toMatch(/const \[images, setImages\] = useState<Array<\{[\s\S]*?\}>>\(\[\]\)/);
    expect(SRC).toMatch(/`\/api\/admin\/profile\/images\?email=\$\{encodeURIComponent\(email\)\}`/);
  });

  it('renders the gallery card with a stable testid', () => {
    expect(SRC).toMatch(/data-testid="profile-gallery"/);
  });

  it('renders an empty state when there are no images yet', () => {
    expect(SRC).toMatch(/No images yet — pick a file below to add one/);
  });

  it('renders one tile per image with delete affordance', () => {
    expect(SRC).toMatch(/data-testid=\{`profile-gallery-tile-\$\{img\.id\}`\}/);
    expect(SRC).toMatch(/data-testid=\{`profile-gallery-delete-\$\{img\.id\}`\}/);
    expect(SRC).toMatch(/`\/api\/admin\/profile\/images\?id=\$\{encodeURIComponent\(img\.id\)\}`/);
  });

  it('Add form POSTs the image as a base64 data URL with the optional caption', () => {
    expect(SRC).toMatch(/data-testid="profile-gallery-input"/);
    expect(SRC).toMatch(/reader\.readAsDataURL\(file\)/);
    expect(SRC).toMatch(/body: JSON\.stringify\(\{ dataUrl, caption: imageCaption \|\| null \}\)/);
  });

  it('surfaces upload errors inline', () => {
    expect(SRC).toMatch(/data-testid="profile-gallery-error"/);
  });
});
