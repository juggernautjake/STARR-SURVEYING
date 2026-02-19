/**
 * Decode literal unicode escape sequences in HTML/text content.
 * Converts patterns like \u2705 or \u{1F512} to their actual characters.
 * This is needed when content stored in the database contains literal
 * escape sequences (e.g. from copy-paste or manual entry) that browsers
 * render as-is rather than interpreting as unicode characters.
 */
export function decodeUnicodeEscapes(text: string): string {
  if (!text) return text;
  // Match \u{XXXXX} (1-6 hex digits) and \uXXXX (exactly 4 hex digits)
  return text
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}
