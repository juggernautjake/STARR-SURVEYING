// lib/checks/words.ts — the amount on a check, written out: "Eight hundred forty-two and 50/100".
//
// The written amount is the legal amount of a check (UCC 3-114: words prevail over figures), so it is
// generated from integer cents, never from a float, and pinned by tests at the awkward edges.
//
// Pure.

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function under1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ''));
  return parts.join(' ');
}

/** Whole dollars in words, lower case: 1_234_567 → "one million two hundred thirty-four thousand five hundred sixty-seven". */
export function dollarsInWords(dollars: number): string {
  if (!Number.isInteger(dollars) || dollars < 0) throw new Error('Whole, non-negative dollars only.');
  if (dollars === 0) return 'zero';
  const scales = ['', 'thousand', 'million', 'billion'];
  const out: string[] = [];
  let n = dollars;
  for (let i = 0; n > 0; i++) {
    const chunk = n % 1000;
    if (chunk) out.unshift(`${under1000(chunk)}${scales[i] ? ` ${scales[i]}` : ''}`);
    n = Math.floor(n / 1000);
  }
  return out.join(' ');
}

/** The check's written amount: "Eight hundred forty-two and 50/100". */
export function amountInWords(amountCents: number): string {
  if (!Number.isInteger(amountCents) || amountCents < 0) throw new Error('Amount must be whole, non-negative cents.');
  const dollars = Math.floor(amountCents / 100);
  const c = String(amountCents % 100).padStart(2, '0');
  const w = dollarsInWords(dollars);
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} and ${c}/100`;
}

/** "$1,234.50" with the asterisk fill banks expect in the amount box, to stop digits being added. */
export function amountFigures(amountCents: number): string {
  const s = (amountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `**${s}`;
}
