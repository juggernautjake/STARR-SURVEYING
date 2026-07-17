import { describe, it, expect } from 'vitest';
import { guessExtension } from '../../mobile/lib/mediaPath';

// workmode Area C — the upload queue names its persisted copy with this extension so the OS knows the
// MIME type on re-read. Pure + off-device (like queueOrder / uploadFailureChoices).
describe('guessExtension', () => {
  it('reads a plain file:// URI extension, normalizing jpeg → .jpg and case', () => {
    expect(guessExtension('file:///docs/pending/abc.jpg')).toBe('.jpg');
    expect(guessExtension('file:///x/photo.JPEG')).toBe('.jpg');
    expect(guessExtension('file:///x/clip.MP4')).toBe('.mp4');
    expect(guessExtension('/tmp/voice.m4a')).toBe('.m4a');
  });

  it('strips a query string or fragment before reading the extension (the old bug)', () => {
    // A content/remote URI can carry these; endsWith(".jpg") missed them and dropped the extension.
    expect(guessExtension('https://cdn/x/photo.jpg?token=abc&v=2')).toBe('.jpg');
    expect(guessExtension('file:///x/clip.mov#t=3')).toBe('.mov');
    expect(guessExtension('content://media/external/image/123.png?w=100')).toBe('.png');
  });

  it('returns empty for unknown or extension-less URIs, not a wrong guess', () => {
    expect(guessExtension('content://media/external/image/123')).toBe(''); // Android content URI, no ext
    expect(guessExtension('file:///x/notes.txt')).toBe('');                // not a media type we handle
    expect(guessExtension('file:///my.pics/photo')).toBe('');             // dotted DIRECTORY, no file ext
    expect(guessExtension('')).toBe('');
  });
});
