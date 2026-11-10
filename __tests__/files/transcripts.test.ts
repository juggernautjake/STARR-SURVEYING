/**
 * Video transcripts: every word timed, and searchable (owner, 2026-11-09).
 *
 * "I want to transcribe videos and have time stamps for the words … there needs to be a way to
 * search the transcript for key words … fence types, where power poles sit and how they connect …
 * We need to be able to search the transcript for each instance of a word/phrase."
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  searchTranscript, queryTokens, normalizeToken, activeWordIndex, hitContext, transcriptLines, parseScribe,
  SURVEY_KEYTERMS, type TranscriptWord,
} from '@/lib/transcripts/model';
import { scribeForm } from '@/lib/transcripts/elevenlabs';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/** Words one second apart, starting at t = 10 s. */
const W = (text: string): TranscriptWord[] => text.split(' ').map((w, i) => ({ w, s: 10 + i, e: 10.8 + i }));

describe('searchTranscript: every instance of a word or phrase', () => {
  const words = W('Here the chain-link fence meets the pipe fence. The power pole has a guy wire, and another Power Pole, sits by the barn. Poles everywhere.');

  it('finds every instance, in order, with its time', () => {
    const hits = searchTranscript(words, 'power pole');
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.start)).toEqual([words[9].s, words[17].s]);
    expect(hits[0].count).toBe(2);
  });

  it('ignores case and punctuation ("Pole," is "pole")', () => {
    expect(searchTranscript(words, 'POWER POLE')).toHaveLength(2);
    expect(searchTranscript(words, 'guy wire')).toHaveLength(1);
  });

  it('a hyphenated word matches the spaced phrase, and the other way round', () => {
    expect(searchTranscript(words, 'chain link')).toHaveLength(1);
    expect(searchTranscript(words, 'chain-link')).toHaveLength(1);
    expect(searchTranscript(W('a T post and a T-post'), 'T-post')).toHaveLength(2);
  });

  it('the last word may be partly typed: "pole" also finds "Poles"', () => {
    expect(searchTranscript(words, 'pole').length).toBe(3);
    expect(searchTranscript(words, 'fenc')).toHaveLength(2);
  });

  it('only from the start of a word: "pole" is not found inside "tadpole"', () => {
    expect(searchTranscript(W('a tadpole in the ditch'), 'pole')).toHaveLength(0);
  });

  it('nothing for an empty or punctuation-only query', () => {
    expect(searchTranscript(words, '')).toEqual([]);
    expect(searchTranscript(words, ' - , ')).toEqual([]);
  });

  it('tokens are normalised the same way on both sides', () => {
    expect(normalizeToken('Pole,')).toBe('pole');
    expect(queryTokens('chain-link  fence')).toEqual(['chain', 'link', 'fence']);
  });
});

describe('reading along', () => {
  const words = W('one two three four five');
  it('the word being spoken is the last one that has started', () => {
    expect(activeWordIndex(words, 5)).toBe(-1);
    expect(activeWordIndex(words, 10)).toBe(0);
    expect(activeWordIndex(words, 12.5)).toBe(2);
    expect(activeWordIndex(words, 99)).toBe(4);
  });

  it('a hit is shown with the words around it', () => {
    const many = W('a b c d e f g h i j k l m n o p q');
    const c = hitContext(many, { index: 8, count: 1, start: 0, end: 0 }, 3, 3);
    expect(c).toEqual({ lead: '… f g h', match: 'i', tail: 'j k l …' });
  });

  it('lines break at pauses', () => {
    const ws: TranscriptWord[] = [
      { w: 'north', s: 0, e: 0.4 }, { w: 'fence.', s: 0.5, e: 0.9 },
      { w: 'pole', s: 4, e: 4.3 }, { w: 'here', s: 4.4, e: 4.7 },
    ];
    expect(transcriptLines(ws)).toEqual([{ from: 0, to: 2, start: 0 }, { from: 2, to: 4, start: 4 }]);
  });
});

describe('parseScribe (ElevenLabs)', () => {
  it('keeps only the words — not the spaces or tagged sounds — with times and a 0–1 confidence', () => {
    const t = parseScribe({
      text: 'Power pole here.', audio_duration_secs: 25.93,
      words: [
        { text: 'Power', type: 'word', start: 1.04, end: 1.36, logprob: 0 },
        { text: ' ', type: 'spacing', start: 1.36, end: 1.36, logprob: 0 },
        { text: 'pole', type: 'word', start: 1.36, end: 1.6, logprob: -0.05 },
        { text: '(wind)', type: 'audio_event', start: 1.6, end: 1.7 },
        { text: 'here.', type: 'word', start: 1.7, end: 2.0 },
        { text: 'lost', type: 'word', start: null, end: null },
      ],
    });
    expect(t.duration).toBe(25.93);
    expect(t.text).toBe('Power pole here.');
    expect(t.words).toEqual([
      { w: 'Power', s: 1.04, e: 1.36, c: 1 },
      { w: 'pole', s: 1.36, e: 1.6, c: 0.951 },
      { w: 'here.', s: 1.7, e: 2 },
    ]);
  });

  it('refuses something that is not a transcript', () => {
    expect(() => parseScribe({ detail: { message: 'nope' } })).toThrow();
  });
});

describe('the ElevenLabs request', () => {
  it('Scribe, by URL, word timestamps, English, the survey terms one field each', () => {
    const f = scribeForm('https://storage.example/v.mp4?token=x');
    expect(f.get('model_id')).toBe('scribe_v2');
    expect(f.get('source_url')).toBe('https://storage.example/v.mp4?token=x');
    expect(f.get('timestamps_granularity')).toBe('word');
    expect(f.getAll('keyterms')).toContain('power pole');
    expect(f.getAll('keyterms').length).toBe(SURVEY_KEYTERMS.length);
  });

  it('every key term fits the documented limits: 50 characters, 5 words, no brackets; under 100 terms', () => {
    expect(SURVEY_KEYTERMS.length).toBeLessThan(100);
    for (const k of SURVEY_KEYTERMS) {
      expect(k.length).toBeLessThanOrEqual(50);
      expect(k.split(/\s+/).length).toBeLessThanOrEqual(5);
      expect(k).not.toMatch(/[<>{}[\]\\]/);
    }
  });
});

describe('the wiring', () => {
  const ROUTE = read('app/api/admin/files/[id]/transcript/route.ts');
  const MEDIA = read('lib/transcripts/media-url.ts');
  const VIEWER = read('app/admin/components/files/FileViewer.tsx');

  it('every read and write makes the file\'s own access check', () => {
    expect(ROUTE.match(/mediaForTranscript\(/g)?.length).toBe(2);
    expect(MEDIA).toContain('resolveMountFile(id, user, admin)');
    expect(MEDIA).toContain('canDownload(access)');
  });

  it('without a key it says transcription is not set up, rather than failing elsewhere', () => {
    expect(ROUTE).toContain('if (!transcriptionConfigured())');
  });

  it('the viewer shows the transcript beside a video and seeks the player from it', () => {
    expect(VIEWER).toContain('<TranscriptPanel');
    expect(VIEWER).toContain('playerRef.current?.seekTo(t)');
  });

  it('the table exists as a seed', () => {
    expect(read('seeds/679_video_transcripts.sql')).toContain('create table if not exists public.video_transcripts');
  });
});
