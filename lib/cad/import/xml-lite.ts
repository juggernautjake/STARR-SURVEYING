// lib/cad/import/xml-lite.ts — a small, dependency-free XML reader for survey interchange files.
//
// ── WHY NOT REGEX, AND WHY NOT A LIBRARY ────────────────────────────────────────────────────────
//
// The existing JobXML reader is regex-based, and for a flat list of `<Point>` elements that is fine.
// LandXML is not flat: a `<Surface>` contains `<Definition>` containing `<Pnts>` containing hundreds
// of `<P>` elements, and an `<Alignment>` contains `<CoordGeom>` containing `<Line>`/`<Curve>`/
// `<Spiral>` children that each carry `<Start>` and `<End>` points. A regex cannot tell you which
// surface a `<P>` belongs to, and getting that wrong silently merges two surfaces into one.
//
// A library would be the obvious answer, but this repo has none, and adding a parser dependency to
// read a file format is a poor trade when the subset needed is this small. `DOMParser` exists in the
// browser and not in Node, and these parsers run on both sides.
//
// So: a pull parser, ~150 lines, that handles exactly what LandXML uses — elements, attributes, text,
// self-closing tags, comments, CDATA, the five predefined entities and numeric character references.
// It does NOT handle DTDs, namespaces-as-semantics (prefixes are kept verbatim in the name) or
// entity declarations, none of which appear in vendor survey exports.
//
// ── THE ONE THING IT MUST NOT DO IS SUCCEED QUIETLY ─────────────────────────────────────────────
//
// A malformed file that parses to an empty tree looks exactly like a valid file with no points, and
// this repo has already paid for that confusion (audit §1.1b — three routes reported "nothing found"
// for years because they dropped an error). So a mismatched close tag throws, and callers surface it.

export interface XmlNode {
  /** Tag name, verbatim, including any namespace prefix. */
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Concatenated direct text content, whitespace-trimmed. Empty when the element has none. */
  text: string;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

/** Resolve XML entities. Unknown named entities are left verbatim rather than dropped — a stray `&`
 *  in a point description should not silently eat the rest of the description. */
export function decodeXmlText(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

export class XmlParseError extends Error {
  constructor(message: string, readonly offset: number) {
    super(message);
    this.name = 'XmlParseError';
  }
}

/** Parse a document and return its root element. Throws `XmlParseError` on malformed input. */
export function parseXml(source: string): XmlNode {
  let i = 0;
  const n = source.length;
  const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];

  const top = () => stack[stack.length - 1];

  while (i < n) {
    const lt = source.indexOf('<', i);
    if (lt === -1) {
      appendText(top(), source.slice(i));
      break;
    }
    if (lt > i) appendText(top(), source.slice(i, lt));

    // Comment / CDATA / declaration / processing instruction — skipped wholesale.
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      if (end === -1) throw new XmlParseError('Unterminated comment', lt);
      i = end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', lt)) {
      const end = source.indexOf(']]>', lt + 9);
      if (end === -1) throw new XmlParseError('Unterminated CDATA section', lt);
      // CDATA is literal — no entity decoding, which is the whole point of it.
      top().text = (top().text + ' ' + source.slice(lt + 9, end)).trim();
      i = end + 3;
      continue;
    }
    if (source.startsWith('<?', lt) || source.startsWith('<!', lt)) {
      const end = source.indexOf('>', lt);
      if (end === -1) throw new XmlParseError('Unterminated declaration', lt);
      i = end + 1;
      continue;
    }

    // Closing tag.
    if (source[lt + 1] === '/') {
      const end = source.indexOf('>', lt);
      if (end === -1) throw new XmlParseError('Unterminated closing tag', lt);
      const name = source.slice(lt + 2, end).trim();
      const open = top();
      if (stack.length === 1) throw new XmlParseError(`Closing tag </${name}> with nothing open`, lt);
      if (open.name !== name) {
        throw new XmlParseError(`Closing tag </${name}> does not match open <${open.name}>`, lt);
      }
      stack.pop();
      i = end + 1;
      continue;
    }

    // Opening tag. Scan to '>' but respect quoted attribute values, since a '>' inside an attribute
    // is legal and reasonably common in descriptions.
    let j = lt + 1;
    let quote: string | null = null;
    while (j < n) {
      const c = source[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
      j++;
    }
    if (j >= n) throw new XmlParseError('Unterminated opening tag', lt);

    const selfClosing = source[j - 1] === '/';
    const inner = source.slice(lt + 1, selfClosing ? j - 1 : j);
    const nameEnd = inner.search(/[\s/]/);
    const name = (nameEnd === -1 ? inner : inner.slice(0, nameEnd)).trim();
    if (!name) throw new XmlParseError('Element with no name', lt);

    const node: XmlNode = { name, attrs: parseAttrs(nameEnd === -1 ? '' : inner.slice(nameEnd)), children: [], text: '' };
    top().children.push(node);
    if (!selfClosing) stack.push(node);
    i = j + 1;
  }

  if (stack.length > 1) {
    throw new XmlParseError(`Unclosed element <${top().name}>`, n);
  }
  const element = root.children.find((c) => !c.name.startsWith('#'));
  if (!element) throw new XmlParseError('Document has no root element', 0);
  return element;
}

function appendText(node: XmlNode, raw: string): void {
  const t = raw.trim();
  if (!t) return;
  node.text = node.text ? `${node.text} ${decodeXmlText(t)}` : decodeXmlText(t);
}

function parseAttrs(s: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    attrs[m[1]] = decodeXmlText(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return attrs;
}

// ── Small helpers the format readers use constantly ─────────────────────────────────────────────

/** Direct children with this tag name, case-insensitively — vendors disagree on casing. */
export function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  const lower = name.toLowerCase();
  return node.children.filter((c) => localName(c.name).toLowerCase() === lower);
}

export function firstChild(node: XmlNode, name: string): XmlNode | null {
  return childrenNamed(node, name)[0] ?? null;
}

/** Every descendant with this tag name, in document order. */
export function descendantsNamed(node: XmlNode, name: string): XmlNode[] {
  const lower = name.toLowerCase();
  const out: XmlNode[] = [];
  const walk = (n: XmlNode) => {
    for (const c of n.children) {
      if (localName(c.name).toLowerCase() === lower) out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

/** Attribute lookup that ignores case — LandXML says `desc`, some writers emit `Desc`. */
export function attr(node: XmlNode, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(node.attrs)) {
    if (localName(k).toLowerCase() === lower) return v;
  }
  return undefined;
}

/** Strip a namespace prefix: `lx:CgPoint` → `CgPoint`. */
export function localName(name: string): string {
  const colon = name.indexOf(':');
  return colon === -1 ? name : name.slice(colon + 1);
}
