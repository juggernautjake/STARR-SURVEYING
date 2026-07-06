// lib/dnd/stream-names-ai.ts — AI-themed chat usernames (Phase J1, server-only). Kept
// separate from stream-names.ts so the client chat overlay can import the pure
// procedural generator without bundling the Anthropic SDK. Falls back to procedural
// names on any failure so the chat never blocks on the network.
import { dndCompleteJSON } from './ai';
import { makeUsernames, styleForName, hashName, type ChatUser } from './stream-names';

export async function aiThemedUsernames(theme: string, count: number): Promise<ChatUser[]> {
  try {
    const names = await dndCompleteJSON<string[]>({
      system: 'You generate short, funny Twitch-style chat usernames. Return ONLY a JSON array of strings — no prose, no handles over 20 characters.',
      user: `Give me ${count} usernames for a "${theme}" themed chat.`,
      maxTokens: 700,
      temperature: 1,
    });
    if (Array.isArray(names) && names.length) {
      return names.slice(0, count).map((raw) => {
        const name = String(raw).slice(0, 24);
        return { name, ...styleForName(name) };
      });
    }
  } catch {
    /* fall through to procedural */
  }
  return makeUsernames(count, hashName(theme) % 1000);
}
