import { describe, it, expect } from 'vitest';
import { guessExtension, sanitiseName } from '../../mobile/lib/mediaPath';

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

describe('sanitiseName — a user filename → one safe storage-path segment', () => {
  it('keeps ordinary names (letters, digits, dot, dash, underscore)', () => {
    expect(sanitiseName('Site Survey-2.pdf')).toBe('Site_Survey-2.pdf');
    expect(sanitiseName('boundary_v3.dwg')).toBe('boundary_v3.dwg');
  });
  it('can never inject a path separator — no traversal into the object key', () => {
    // Slashes/backslashes are stripped, so the result is always a single segment. The caller composes
    // `${userId}/${tag}-${id}-${name}${ext}`; a `..` that survives is harmless without a slash beside it.
    expect(sanitiseName('../../etc/passwd')).not.toMatch(/[/\\]/);
    expect(sanitiseName('..\\..\\windows\\system32')).not.toMatch(/[/\\]/);
    expect(sanitiseName('a/b/c')).toBe('a_b_c');
  });
  it('neutralizes the SNEAKY separators too — Unicode slashes, null bytes, control chars', () => {
    // The safety here is the WHITELIST ([^A-Za-z0-9._\- ] → _), NOT the ASCII slash-strip — these vectors
    // slip past a naive slash-only sanitiser, so pin that they can never reach the object key. If someone
    // "optimizes" the whitelist into a slash blocklist, these fail.
    expect(sanitiseName('a／b')).toBe('a_b');   // U+FF0F fullwidth solidus
    expect(sanitiseName('a∕b')).toBe('a_b');   // U+2215 division slash
    expect(sanitiseName('a⁄b')).toBe('a_b');   // U+2044 fraction slash
    expect(sanitiseName('a' + String.fromCharCode(0) + 'b')).toBe('a_b');   // U+0000 null byte
    expect(sanitiseName('a\tb\nc')).toBe('a_b_c');  // tab + newline
    // Whatever the input, the output is drawn ONLY from the safe alphabet (letters/digits/. _ -):
    for (const raw of ['../../x', 'a／../passwd', '\u{1F4A3}/rm -rf', 'C:\\Windows']) {
      expect(sanitiseName(raw)).toMatch(/^[A-Za-z0-9._-]+$/);
    }
  });
  it('replaces unusual characters and collapses whitespace', () => {
    expect(sanitiseName('a:b*c.txt')).toBe('a_b_c.txt'); // each of : and * → one underscore
    expect(sanitiseName('two   spaces')).toBe('two_spaces');
  });
  it('caps length at 80 and falls back to "file" when nothing survives', () => {
    expect(sanitiseName('x'.repeat(200)).length).toBe(80);
    expect(sanitiseName('')).toBe('file');
    expect(sanitiseName('///')).toBe('_'); // slashes → underscore, not empty
  });
});
