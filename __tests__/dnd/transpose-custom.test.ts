// __tests__/dnd/transpose-custom.test.ts — Area TR3. The transpose route honors the custom-content consent:
// vanilla-first always; only with allowCustom may the AI create BALANCED custom content, told to read the
// target system first. Source-anchors the route wiring (the AI call isn't run in unit tests).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/system/route.ts'), 'utf8');

describe('transpose route honors allowCustom (TR3)', () => {
  it('parses allowCustom from the body, defaulting to false (never silently invents)', () => {
    expect(route).toContain('const allowCustom = body?.allowCustom === true');
  });

  it('selects the prompt by consent: vanilla-only vs balanced-custom', () => {
    expect(route).toContain('transposeSystemPrompt(allowCustom)');
    expect(route).toMatch(/never invent new classes/i);        // vanilla-only prompt
    expect(route).toMatch(/BALANCED custom element/);          // allow-custom prompt
    expect(route).toMatch(/balanced against comparable vanilla content/i);
  });

  it('tells the AI to READ the target system first and prefer vanilla', () => {
    expect(route).toMatch(/READ and understand the TARGET system’s rules/);
    expect(route).toMatch(/PREFER the target system’s VANILLA options/);
  });

  it('custom pieces are listed for DM review, and the response reports allowedCustom', () => {
    expect(route).toMatch(/with "CUSTOM:"/);            // still flagged in the summary
    expect(route).toContain('record EVERY invented element in the `custom` array'); // + a structured manifest
    expect(route).toContain('allowedCustom: allowCustom');
  });
});
