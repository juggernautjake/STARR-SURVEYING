// The system transposer (P6-18).
//
// The owner's ask was not "translate it" — it was the LOOP: *"review it and approve it or deny it or tell
// the AI to try again, along with a few notes … continue this process until satisfied, or edit the AI
// generated thing … if it is close."* A one-shot translation is a party trick; one you can reject with a
// sentence and have re-attempted is a tool. These assertions are mostly about the loop and about provenance.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeTransposed, transposeUserPrompt, transposeCredit, TRANSPOSE_SYSTEM_PROMPT,
} from '@/lib/dnd/homebrew/transpose';
import type { HomebrewContent } from '@/lib/dnd/homebrew/model';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const route = read('app/api/dnd/homebrew/[id]/transpose/route.ts');
const panel = read('app/dnd/_ui/TransposePanel.tsx');

const src = (over: Partial<HomebrewContent> = {}): HomebrewContent => ({
  id: 'hb-1', kind: 'feat', name: 'Iron Jaw', system: 'dnd5e-2024',
  creator: { name: 'Jacob' }, status: 'approved', description: 'You shrug off a blow.', ...over,
});

describe('normalizeTransposed', () => {
  it('reads a usable draft', () => {
    const d = normalizeTransposed({ name: 'Iron Jaw', summary: 's', description: 'body', rationale: 'why' })!;
    expect(d.name).toBe('Iron Jaw');
    expect(d.rationale).toBe('why');
  });

  it('returns null without a name or body — an empty draft wastes the reviewer worse than an error', () => {
    expect(normalizeTransposed({ name: 'X' })).toBeNull();
    expect(normalizeTransposed({ description: 'body' })).toBeNull();
    expect(normalizeTransposed('nope')).toBeNull();
  });
});

describe('the prompt refuses to invent mechanics', () => {
  it('says use only what genuinely exists in the target', () => {
    expect(TRANSPOSE_SYSTEM_PROMPT).toMatch(/ONLY mechanics that genuinely exist/);
    expect(TRANSPOSE_SYSTEM_PROMPT).toMatch(/never invent a subsystem/i);
  });

  it('and to say so rather than fabricate when there is no equivalent', () => {
    // Ground Rule 3, applied to a translator: the failure mode is a confident mechanic that does not exist.
    expect(TRANSPOSE_SYSTEM_PROMPT).toMatch(/do not\s*\n?·?\s*fabricate|do not fabricate/i);
    expect(TRANSPOSE_SYSTEM_PROMPT).toMatch(/no honest equivalent/i);
  });

  it('warns that numbers do not carry across systems', () => {
    expect(TRANSPOSE_SYSTEM_PROMPT).toMatch(/A \+2 in one system is not/);
  });
});

describe('the retry prompt is what makes it a conversation', () => {
  it('includes the PREVIOUS attempt, not just the notes', () => {
    // Without it the model cannot tell what the author is reacting to, and reliably reproduces the thing
    // they just rejected.
    const p = transposeUserPrompt(src(), 'pathfinder2e', {
      notes: 'too strong', previous: { name: 'Iron Jaw', summary: '', description: 'old body' },
    });
    expect(p).toMatch(/YOUR PREVIOUS ATTEMPT/);
    expect(p).toContain('old body');
  });

  it('and tells it to leave alone what the author did not mention', () => {
    const p = transposeUserPrompt(src(), 'pathfinder2e', { notes: 'too strong' });
    expect(p).toMatch(/Everything they did not mention should stay as it was/);
  });

  it('says nothing about a previous attempt on the first run', () => {
    expect(transposeUserPrompt(src(), 'pathfinder2e')).not.toMatch(/PREVIOUS ATTEMPT/);
  });

  it('tells it not to build a payload the target cannot carry', () => {
    // Otherwise the author reviews numbers that would never resolve on that system.
    const p = transposeUserPrompt(src({ kind: 'class' }), 'pathfinder2e');
    expect(p).toMatch(/written as rules text on this platform/);
  });
});

describe('provenance travels with the piece, not just the UI', () => {
  it('the credit names the original and admits it is unchecked', () => {
    const c = transposeCredit(src(), 'dnd5e-2024');
    expect(c).toContain('Iron Jaw');
    expect(c).toMatch(/AI-translated/);
    expect(c).toMatch(/not yet checked by a human/);
  });

  it('and is written into the DESCRIPTION, which is what reaches the library and exports', () => {
    // A provenance note that exists only in one component is not provenance.
    expect(route).toContain('transposeCredit');
    expect(route).toMatch(/description = `\$\{draft\.description\}/);
  });

  it('the draft is created PRIVATE, so a machine translation cannot reach a library or a sheet', () => {
    expect(route).toMatch(/visibility: 'private'/);
    expect(route).toMatch(/status: 'draft'/);
  });

  it('and carries origin_id, so the variant knows what it came from', () => {
    expect(route).toContain('origin_id: params.id');
  });
});

describe('the loop', () => {
  it('a retry REWRITES the same draft rather than stacking another', () => {
    // Otherwise a fussy author ends with nine rejected drafts instead of one they like.
    expect(route).toMatch(/if \(variantId\) \{[\s\S]{0,200}\.update\(/);
    expect(panel).toMatch(/variantId: retry && variant \? variant\.id : undefined/);
  });

  it('and `variantId` cannot be pointed at an arbitrary row', () => {
    // Without these checks "retry" is a write primitive aimed at any id.
    expect(route).toMatch(/v\.owner_user_id !== session\.userId/);
    expect(route).toMatch(/v\.origin_id !== params\.id/);
  });

  it('offers all four exits the owner described', () => {
    for (const exit of ['Keep it', 'Try again', 'Open &amp; edit', 'Discard']) {
      expect(panel, `the review is missing "${exit}"`).toContain(exit);
    }
  });

  it('approve and discard reuse the ordinary PATCH/DELETE rather than bespoke endpoints', () => {
    // A translated piece must obey exactly the same ownership rules as any other.
    expect(panel).toMatch(/method: 'DELETE'/);
    expect(route, 'no bespoke approve endpoint').not.toMatch(/function (PATCH|DELETE)/);
  });

  it('runs hotter than the design review, because a retry must actually differ', () => {
    const assess = read('app/api/dnd/homebrew/[id]/assess/route.ts');
    const t = Number(/temperature: ([\d.]+)/.exec(route)?.[1]);
    const a = Number(/temperature: ([\d.]+)/.exec(assess)?.[1]);
    expect(t).toBeGreaterThan(a);
  });
});

describe('gates', () => {
  it('is rate-limited', () => {
    expect(route).toContain("checkRateLimit('ai'");
  });

  it('needs only READ on the source — translating public content is reasonable', () => {
    // The result belongs to the translator, with the original credited; the source is never modified.
    expect(route).toContain('canReadHomebrew');
    expect(route).toContain('owner_user_id: session.userId');
  });

  it('refuses a translation into the system it is already written for', () => {
    expect(route).toMatch(/target === source\.system/);
  });

  it('and refuses an unplayable target system', () => {
    expect(route).toContain('isSystemAvailable');
  });
});
