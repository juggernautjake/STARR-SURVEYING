// worker/relay/server.mjs, the parts that run without a socket: sentence chunking, the URL token
// (which must agree byte-for-byte with lib/receptionist/relay.ts), and the streamed-turn reader.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { relayToken } from '@/lib/receptionist/relay';

process.env.APP_BASE_URL = 'https://app.example.test';
process.env.RECEPTIONIST_RELAY_SECRET = 'relay-secret-relay-secret-relay-secret';
const relay = await import('../../worker/relay/server.mjs');

describe('sentence chunker', () => {
  it('sends whole sentences as they complete and holds the tail for last:true', () => {
    const out: Array<[string, boolean | undefined]> = [];
    const c = relay.sentenceChunker((s: string, last?: boolean) => out.push([s, last]));
    c.push('Sure thing');
    c.push(', Jane. What is the');
    expect(out).toEqual([['Sure thing, Jane. ', undefined]]);
    c.push(' address? I can look');
    expect(out).toEqual([['Sure thing, Jane. ', undefined], ['What is the address? ', undefined]]);
    expect(c.flush(true)).toBe(true);
    expect(out[2]).toEqual(['I can look', true]);
    expect(c.flush(true)).toBe(false);
  });
  it('keeps a closing quote with its sentence and ignores blank fragments', () => {
    const out: string[] = [];
    const c = relay.sentenceChunker((s: string) => out.push(s));
    c.push('He said "yes." Then left.\n\n');
    expect(out).toEqual(['He said "yes." ', 'Then left. ']);
  });
});

describe('URL token (must match the app)', () => {
  it('accepts the app-minted token and refuses expired or foreign ones', () => {
    const secret = process.env.RECEPTIONIST_RELAY_SECRET!;
    const exp = Math.floor(Date.now() / 1000) + 300;
    const t = relayToken('CA9', exp, secret);
    expect(relay.validToken('CA9', exp, t, secret)).toBe(true);
    expect(relay.validToken('CA9', exp, t, secret, (exp + 5) * 1000)).toBe(false);
    expect(relay.validToken('CA8', exp, t, secret)).toBe(false);
  });
});

describe('streamed turn reader', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });
  it('forwards the words as they arrive and parses the envelope after the separator', async () => {
    const enc = new TextEncoder();
    const parts = ['Hi Jane. ', 'What is the addr', 'ess?{"next":"continue","facts":{"name":"Jane"},"say":"Hi Jane. What is the address?"}'];
    globalThis.fetch = vi.fn(async () => new Response(new ReadableStream({ start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close(); } }), { status: 200 })) as unknown as typeof fetch;
    const words: string[] = [];
    const env = await relay.streamTurn({ event: 'turn', callSid: 'CA1', from: '+1', heard: 'hello', state: { turns: [], facts: {} } }, (w: string) => words.push(w));
    expect(words.join('')).toBe('Hi Jane. What is the address?');
    expect(env.next).toBe('continue');
    expect(env.facts).toEqual({ name: 'Jane' });
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe('https://app.example.test/api/twilio/receptionist/relay-turn');
    expect((call[1].headers as Record<string, string>)['x-relay-secret']).toBe(process.env.RECEPTIONIST_RELAY_SECRET);
  });
  it('throws on a non-200 so the session falls back to voicemail', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 403 })) as unknown as typeof fetch;
    await expect(relay.streamTurn({ event: 'turn', callSid: 'CA1', from: '', heard: 'x', state: {} }, () => {})).rejects.toThrow('relay-turn 403');
  });
});
