import { describe, it, expect } from 'vitest';
import { splitTutorReply } from '@/lib/learn/tutor-script';
import { scriptToSpeech } from '@/lib/learn/speakable';

describe('splitTutorReply — separates the display reply from the voice script', () => {
  it('splits on the marker', () => {
    const raw = 'Here is the **answer** with $x^2$.\n\n===VOICE_SCRIPT===\nLet\'s walk through it together.';
    const { reply, voiceScript } = splitTutorReply(raw);
    expect(reply).toBe('Here is the **answer** with $x^2$.');
    expect(voiceScript).toBe("Let's walk through it together.");
  });

  it('is tolerant of spacing/case/underscores around the marker', () => {
    const raw = 'Reply body.\n === Voice_Script ===\nSpoken part.';
    const { reply, voiceScript } = splitTutorReply(raw);
    expect(reply).toBe('Reply body.');
    expect(voiceScript).toBe('Spoken part.');
  });

  it('returns null script when there is no marker (fallback path)', () => {
    const { reply, voiceScript } = splitTutorReply('Just a plain reply.');
    expect(reply).toBe('Just a plain reply.');
    expect(voiceScript).toBeNull();
  });

  it('does not confuse a Markdown --- rule for the marker', () => {
    const raw = 'Intro.\n\n---\n\nMore.\n\n===VOICE_SCRIPT===\nScript.';
    const { reply, voiceScript } = splitTutorReply(raw);
    expect(reply).toContain('---');
    expect(voiceScript).toBe('Script.');
  });

  it('keeps the non-empty half if the reply half is blank', () => {
    const { reply, voiceScript } = splitTutorReply('===VOICE_SCRIPT===\nOnly a script.');
    expect(reply).toBe('Only a script.');
    expect(voiceScript).toBeNull();
  });
});

describe('scriptToSpeech — renders a teaching script for the voice', () => {
  it('resolves [[FIGn]] tokens to the same label the screen shows', () => {
    const out = scriptToSpeech('Take a look at [[FIG1]] and then [[FIG2]].', { figureGroup: 2 });
    // "2A" is spoken "figure two A"; "2B" is spoken "figure two bee" — both match
    // their on-screen badges when heard, they just reach it via different paths.
    expect(out).toContain('figure 2 A');
    expect(out).toContain('figure 2 bee');
    expect(out).not.toContain('[[');
  });

  it('still applies the safety-net normalizer to stray symbols in the script', () => {
    const out = scriptToSpeech('The tolerance is 0.0004 and n = 30 here.', { figureGroup: 1 });
    expect(out).toContain('0 point zero zero zero four'); // integer "0" read as "zero" by TTS
    expect(out).toContain('equals');
    expect(out).toContain(' en '); // lone variable enunciated
    expect(out).not.toContain('=');
  });

  it('returns empty string for an empty script', () => {
    expect(scriptToSpeech('', { figureGroup: 1 })).toBe('');
  });
});
