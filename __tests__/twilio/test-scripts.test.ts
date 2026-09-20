// __tests__/twilio/test-scripts.test.ts — the rehearsal scripts stay usable.
//
// These exist to be READ and ACTED OUT, so the failure they are prone to is not a crash — it is a
// script that quietly stops covering what it claims to cover, or a generated folder that has
// drifted from the data the bench actually runs.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TEST_SCRIPTS, testScript, estimatedSeconds } from '@/lib/receptionist/test-scripts';
import { CALL_BUDGET_MS } from '@/lib/receptionist/intake';

const DOCS = path.join(process.cwd(), 'docs', 'receptionist', 'test-scripts');

describe('the set as a whole', () => {
  it('has enough scripts to be worth the folder', () => {
    // The owner asked for 15-20.
    expect(TEST_SCRIPTS.length).toBeGreaterThanOrEqual(15);
  });

  it('has unique ids', () => {
    const ids = TEST_SCRIPTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is findable by id, and safe for one that is not there', () => {
    expect(testScript(TEST_SCRIPTS[0].id)?.id).toBe(TEST_SCRIPTS[0].id);
    expect(testScript('nope')).toBeUndefined();
  });

  it('covers all three difficulties, so a tester can start easy', () => {
    const levels = new Set(TEST_SCRIPTS.map((s) => s.difficulty));
    expect(levels).toEqual(new Set(['straightforward', 'awkward', 'hard']));
  });
});

describe('every script is actually usable', () => {
  for (const s of TEST_SCRIPTS) {
    describe(s.id, () => {
      it('says who is calling and what it is testing', () => {
        expect(s.persona.length, 'no persona').toBeGreaterThan(25);
        // The "what this tests" line is the whole reason a script is in the set rather than being
        // a nice piece of writing. Without it nobody knows what a pass looks like.
        expect(s.tests.length, 'does not say what it is testing').toBeGreaterThan(40);
      });

      it('has turns, and every turn is either speech or silence', () => {
        expect(s.turns.length).toBeGreaterThan(0);
        for (const [i, t] of s.turns.entries()) {
          const hasSpeech = Boolean(t.says && t.says.trim());
          const hasSilence = Boolean(t.silenceSeconds);
          expect(hasSpeech || hasSilence, `turn ${i + 1} is empty`).toBe(true);
          // A turn that is both is ambiguous: does the tester speak, or wait?
          expect(hasSpeech && hasSilence, `turn ${i + 1} is both speech and silence`).toBe(false);
        }
      });

      it('runs somewhere between one and seven minutes', () => {
        expect(s.minutes).toBeGreaterThanOrEqual(1);
        expect(s.minutes).toBeLessThanOrEqual(7);
      });

      it('says what the agent should end up with, unless there is genuinely nothing', () => {
        // Two scripts legitimately capture nothing — a silent call and a wrong number. Everything
        // else has to say what a good outcome looks like or it cannot be marked.
        const nothingExpected = ['silence-then-nothing', 'wrong-business'].includes(s.id);
        if (!nothingExpected) expect(s.shouldCapture.length, 'no expected outcome').toBeGreaterThan(2);
      });
    });
  }
});

describe('the scripts cover what the owner asked for', () => {
  const ids = TEST_SCRIPTS.map((s) => s.id);
  const has = (id: string) => expect(ids, `missing the '${id}' script`).toContain(id);

  it('the two straightforward ones', () => {
    has('subdivision-lot-house');
    has('thirteen-acre-tract');
  });

  it('the confused elevation certificate', () => has('elevation-certificate-confused'));
  it('construction staking across several Austin sites', () => has('construction-staking-austin'));
  it('the stutterer who keeps looking things up', () => has('stutters-and-searches'));
  it('questions with no job attached', () => has('questions-no-job'));
  it('the quote chaser', () => has('quote-chaser'));
  it('hard names with conflicting information', () => has('hard-names-conflicting-info'));
  it('the sparse message', () => has('sparse-message'));
  it('silence that turns into a conversation, and silence that does not', () => {
    has('silence-then-speaks');
    has('silence-then-nothing');
  });
  it('somebody far outside the service area', () => has('far-out-of-area'));
  it('the seven-minute caller', () => has('the-talker-seven-minutes'));
});

describe('the long one really is long', () => {
  const talker = testScript('the-talker-seven-minutes')!;

  it('is the only script that reaches the cap', () => {
    const atCap = TEST_SCRIPTS.filter((s) => s.minutes * 60 * 1000 >= CALL_BUDGET_MS);
    expect(atCap.map((s) => s.id)).toEqual(['the-talker-seven-minutes']);
  });

  it('has enough turns to actually get there', () => {
    // A seven-minute label on a four-turn script is a wish, not a rehearsal. Roughly 25 seconds a
    // turn including the agent's reply, so it needs well over a dozen.
    expect(talker.turns.length).toBeGreaterThanOrEqual(15);
  });

  it('says in its notes that the wind-down is the point', () => {
    expect(talker.notes ?? '').toMatch(/wind-down|cap/i);
  });
});

describe('the silences are long enough to mean something', () => {
  it('the stutterer has a pause nobody would sit through by accident', () => {
    const s = testScript('stutters-and-searches')!;
    const longest = Math.max(...s.turns.map((t) => t.pauseSeconds ?? t.silenceSeconds ?? 0));
    // A four-second gap tests nothing. Twenty is where a badly built agent gives up on somebody.
    expect(longest).toBeGreaterThanOrEqual(20);
  });

  it('the silent caller is silent more than once', () => {
    const s = testScript('silence-then-nothing')!;
    expect(s.turns.filter((t) => t.silenceSeconds).length).toBeGreaterThanOrEqual(2);
  });
});

describe('estimatedSeconds', () => {
  it('counts speech, silence and pauses', () => {
    const quick = estimatedSeconds({ ...TEST_SCRIPTS[0], turns: [{ says: 'hello there' }] });
    const slow = estimatedSeconds({ ...TEST_SCRIPTS[0], turns: [{ says: 'hello there', pauseSeconds: 30 }] });
    expect(slow - quick).toBe(30);
  });

  it('roughly agrees with the stated minutes', () => {
    // Within a factor of three either way. This is a sanity check on the labels, not a stopwatch —
    // a script labelled two minutes with forty turns is mislabelled and a tester will be surprised.
    for (const s of TEST_SCRIPTS) {
      const stated = s.minutes * 60;
      expect(estimatedSeconds(s), `${s.id}: labelled ${s.minutes}m`).toBeLessThan(stated * 3);
    }
  });
});

describe('the generated folder is current', () => {
  it('exists, with a file per script and an index', () => {
    // A folder that has drifted from the data is worse than no folder: somebody acts out a script
    // that is no longer the one being tested.
    expect(fs.existsSync(DOCS), 'run: node scripts/write-test-scripts.mjs').toBe(true);
    // `~$…` is a Word lock file, left behind while somebody has a script OPEN — which is what this
    // folder is for. Counting it failed the suite because a person was reading the documentation.
    const files = fs.readdirSync(DOCS)
      .filter((f) => f.endsWith('.md') && !f.startsWith('~$') && !f.startsWith('.'));
    expect(files).toContain('README.md');
    expect(files.length).toBe(TEST_SCRIPTS.length + 1);
  });

  it('names every script', () => {
    const readme = fs.readFileSync(path.join(DOCS, 'README.md'), 'utf8');
    for (const s of TEST_SCRIPTS) {
      expect(readme, `${s.id} is not in the index`).toContain(s.title);
    }
  });

  it('writes every turn out, not just the first few', () => {
    // The first generator parsed the TypeScript with a regex and dropped every single-line turn —
    // 39 of 197 survived, and it printed a tick. This counts them.
    const s = TEST_SCRIPTS.find((x) => x.id === 'stutters-and-searches')!;
    const index = TEST_SCRIPTS.indexOf(s) + 1;
    const file = path.join(DOCS, `${String(index).padStart(2, '0')}-${s.id}.md`);
    const md = fs.readFileSync(file, 'utf8');
    const numbered = (md.match(/^\*\*\d+\.\*\*/gm) ?? []).length;
    expect(numbered, 'the generated file is missing turns').toBe(s.turns.length);
  });
});
