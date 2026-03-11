/**
 * HTML parsing utilities for Bell County website scraping.
 * Shared helpers used by multiple scrapers.
 */

/**
 * Extract text content from HTML, stripping all tags.
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extract all href links from HTML.
 */
export function extractLinks(html: string, baseUrl: string): Array<{ href: string; text: string }> {
  const links: Array<{ href: string; text: string }> = [];
  const pattern = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    let href = match[1];
    const text = stripHtml(match[2]);

    // Resolve relative URLs
    if (href.startsWith('/')) {
      const url = new URL(baseUrl);
      href = `${url.protocol}//${url.host}${href}`;
    } else if (!href.startsWith('http')) {
      href = `${baseUrl.replace(/\/$/, '')}/${href}`;
    }

    links.push({ href, text });
  }

  return links;
}

/**
 * Extract table rows from an HTML table.
 */
export function extractTableRows(html: string): string[][] {
  const rows: string[][] = [];
  const rowPattern = /<tr[^>]*>(.*?)<\/tr>/gis;
  const cellPattern = /<t[dh][^>]*>(.*?)<\/t[dh]>/gis;

  let rowMatch;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const cells: string[] = [];
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
      cells.push(stripHtml(cellMatch[1]));
    }
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return rows;
}

/**
 * Extract a value from an HTML key-value display (common in CAD detail pages).
 * Looks for patterns like: <label>Key:</label><span>Value</span>
 */
export function extractKeyValue(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`${key}\\s*:?\\s*</(?:label|th|td|dt|strong|b)>\\s*<(?:span|td|dd|div)[^>]*>([^<]+)`, 'i'),
    new RegExp(`${key}\\s*:?\\s*([^<]+)`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
  }

  return null;
}
