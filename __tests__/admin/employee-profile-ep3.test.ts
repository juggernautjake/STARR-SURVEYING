// __tests__/admin/employee-profile-ep3.test.ts
//
// Slice EP3 — profile-pic upload via a public `user-avatars`
// bucket. The endpoint validates the mime + size, writes the new
// avatar URL to registered_users.avatar_url, and cleans up any
// prior custom avatar in the same bucket so storage doesn't
// drift. ProfilePanel hangs a hidden <input type="file"> over
// the existing avatar so click-to-change just works.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('API /api/admin/profile/avatar (EP3)', () => {
  const SRC = read('app/api/admin/profile/avatar/route.ts');

  it('declares the user-avatars bucket + 5MB cap', () => {
    expect(SRC).toMatch(/const BUCKET = 'user-avatars'/);
    expect(SRC).toMatch(/MAX_BYTES = 5 \* 1024 \* 1024/);
  });

  it('restricts uploads to PNG / JPEG / WEBP / GIF', () => {
    expect(SRC).toMatch(/ALLOWED_MIMES = new Set\(\['image\/jpeg', 'image\/png', 'image\/webp', 'image\/gif'\]\)/);
  });

  it('POST decodes the data URL + checks the mime', () => {
    expect(SRC).toMatch(/body\.dataUrl\.match\(\/\^data:\(\[\^;\]\*\);base64,\(\.\*\)\$\/s\)/);
    expect(SRC).toMatch(/!ALLOWED_MIMES\.has\(mime\)/);
  });

  it('POST writes the public URL to registered_users.avatar_url', () => {
    expect(SRC).toMatch(/\.from\('registered_users'\)[\s\S]*?\.update\(\{ avatar_url: publicUrl \}\)/);
  });

  it('POST prunes the previous custom avatar IF it lived in the user-avatars bucket', () => {
    expect(SRC).toMatch(/priorUrl && priorUrl\.includes\(`\/\$\{BUCKET\}\/`\)/);
    expect(SRC).toMatch(/\.from\(BUCKET\)\.remove\(\[after\]\)/);
  });

  it('POST rolls back the storage upload if the DB update fails', () => {
    expect(SRC).toMatch(/if \(dbErr\) \{\s*\n\s*await supabaseAdmin\.storage\.from\(BUCKET\)\.remove\(\[storagePath\]\)/);
  });

  it('DELETE clears avatar_url + removes the bucket object', () => {
    expect(SRC).toMatch(/\.update\(\{ avatar_url: null \}\)/);
    expect(SRC).toMatch(/priorUrl\.split\(`\/\$\{BUCKET\}\/`\)\[1\]/);
  });
});

describe('ProfilePanel — change-photo affordance (EP3)', () => {
  const SRC = read('app/admin/profile/ProfilePanel.tsx');

  it('holds liveAvatarUrl + avatarSaving + avatarError state', () => {
    expect(SRC).toMatch(/const \[liveAvatarUrl, setLiveAvatarUrl\] = useState<string \| null>\(null\)/);
    expect(SRC).toMatch(/const \[avatarSaving, setAvatarSaving\] = useState\(false\)/);
    expect(SRC).toMatch(/const \[avatarError, setAvatarError\] = useState<string \| null>\(null\)/);
  });

  it('wraps the avatar in a <label> that hosts the hidden file input', () => {
    expect(SRC).toMatch(/data-testid="profile-avatar-change"/);
    expect(SRC).toMatch(/data-testid="profile-avatar-input"/);
    expect(SRC).toMatch(/accept="image\/png,image\/jpeg,image\/webp,image\/gif"/);
  });

  it("renders liveAvatarUrl when set (overrides the session image after a successful upload)", () => {
    expect(SRC).toMatch(/\(liveAvatarUrl \?\? image\)/);
  });

  it('POSTs the file as a base64 data URL to /api/admin/profile/avatar', () => {
    expect(SRC).toMatch(/'\/api\/admin\/profile\/avatar'/);
    expect(SRC).toMatch(/reader\.readAsDataURL\(file\)/);
    expect(SRC).toMatch(/setLiveAvatarUrl\(data\.avatar_url\)/);
  });

  it('surfaces upload errors inline next to the avatar', () => {
    expect(SRC).toMatch(/data-testid="profile-avatar-error"/);
  });
});

describe('AdminMe.css — avatar hover-overlay reveal', () => {
  const CSS = read('app/admin/me/AdminMe.css');

  it('on hover/focus-within of the label, the .profile-page__avatar-hover overlay fades in', () => {
    expect(CSS).toMatch(/label\[data-testid="profile-avatar-change"\]:hover \.profile-page__avatar-hover/);
    expect(CSS).toMatch(/label\[data-testid="profile-avatar-change"\]:focus-within \.profile-page__avatar-hover/);
    expect(CSS).toMatch(/opacity:\s*1\s*!important/);
  });
});
