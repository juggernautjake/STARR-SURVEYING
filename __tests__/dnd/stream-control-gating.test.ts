// __tests__/dnd/stream-control-gating.test.ts — who sees the stream controls (owner 2026-07-18):
//   • Outside a campaign, the character's OWNER gets the full director controls (like the DM).
//   • Inside a campaign, only the DM sees/edits them — not even the owner.
//   • Viewers see the actual live status (StreamChat renders only while is_live).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const control = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/StreamControl.tsx'), 'utf8');
const owner = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/StreamOwnerControls.tsx'), 'utf8');
const app = readFileSync(join(process.cwd(), 'app/dnd/_sheet/App.tsx'), 'utf8');
const chat = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/StreamChat.tsx'), 'utf8');

describe('StreamControl gating', () => {
  it('renders for the DM, or the owner OUTSIDE a campaign — never the owner inside a campaign', () => {
    expect(control).toContain('const canControl = isDM || (isOwner && !campaignId)');
    expect(control).toContain('if (!canControl || !characterId) return null');
  });
});

describe('StreamOwnerControls gating', () => {
  // Owner 2026-07-19: the streamer holds her own go-live / end-stream switch in a campaign
  // too, alongside the DM — reversing the 2026-07-18 rule that hid the bar inside one.
  it('the owner’s own bar shows in a campaign as well as outside one', () => {
    expect(owner).toContain('const isOwner = canWrite && !isDM');
    expect(owner).not.toContain('const isOwner = canWrite && !isDM && !campaignId');
  });
});

describe('App wires the owner the full panel outside a campaign', () => {
  it('renders StreamControl for a non-DM owner when there is no campaign', () => {
    expect(app).toContain('hasStream && canWrite && !isDM && !campaignId && <StreamControl />');
  });
  it('lets the owner-outside-campaign control polls too', () => {
    expect(app).toContain('isController={isDM || (canWrite && !isDM && !campaignId)}');
  });
});

describe('viewers see the actual live status', () => {
  it('StreamChat renders nothing when the stream is not live (DM ending it closes it for everyone)', () => {
    expect(chat).toContain('if (!stream?.is_live) return null');
  });
});
