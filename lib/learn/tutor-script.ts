// lib/learn/tutor-script.ts
//
// The AI tutor returns TWO channels in one completion: the DISPLAY REPLY
// (rich Markdown the student sees) and a VOICE SCRIPT (a plain-spoken lesson
// that teaches through the reply for the read-aloud tutor — it refers to
// tables/charts via [[FIGn]] tokens and to equations by meaning rather than
// reading them). The two are separated by a marker line so we can split them
// server-side. If the marker is absent (older behavior / a model slip), the
// whole output is the reply and the voice falls back to normalizing it.

export const VOICE_SCRIPT_MARKER = '===VOICE_SCRIPT===';

// Tolerant matcher: optional surrounding blank lines, any number of '=' (>=3),
// case-insensitive, allows spaces/underscores/hyphens around "VOICE SCRIPT".
const MARKER_RE = /\n?\s*={3,}\s*voice[\s_-]*script\s*={3,}\s*\n?/i;

export interface SplitReply {
  reply: string;
  voiceScript: string | null;
}

/** Split a raw tutor completion into the display reply and the voice script. */
export function splitTutorReply(raw: string): SplitReply {
  const text = (raw ?? '').trim();
  if (!text) return { reply: '', voiceScript: null };

  const m = MARKER_RE.exec(text);
  if (!m) return { reply: text, voiceScript: null };

  const reply = text.slice(0, m.index).trim();
  const voiceScript = text.slice(m.index + m[0].length).trim();
  // Guard against a stray/empty half — if either side is empty, keep the
  // non-empty side as the reply and drop the script.
  if (!reply) return { reply: voiceScript, voiceScript: null };
  return { reply, voiceScript: voiceScript || null };
}
