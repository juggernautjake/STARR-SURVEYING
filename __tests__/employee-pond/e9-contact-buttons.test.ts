// __tests__/employee-pond/e9-contact-buttons.test.ts
//
// employee-pond Slice E9 — Email + Direct Message contact button
// wiring. Locks the dialogue markup (mailto link + custom-event
// dispatch) and the FloatingMessenger's listener that opens the
// widget preloaded with the requested recipient.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('EmployeePond dialogue — E9 Email button', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('Email button is now an <a> with mailto: href so right-click + copy works', () => {
    expect(SRC).toMatch(
      /<a\s*\n\s*href=\{`mailto:\$\{selectedEmployee\.email\}`\}[\s\S]*?data-action="contact-email"/,
    );
  });

  it('keeps the data-testid for stable e2e selection', () => {
    expect(SRC).toMatch(/data-testid="employee-pond-dialogue-email"/);
  });
});

describe('EmployeePond dialogue — E9 Direct Message button', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it("DM button dispatches a 'employee-pond:open-messenger' CustomEvent on click", () => {
    expect(SRC).toMatch(
      /new CustomEvent\('employee-pond:open-messenger', \{\s*\n?\s*detail: \{ email: selectedEmployee\.email \},/,
    );
  });

  it("closes the dialogue after sending the open-messenger event so the widget has full focus", () => {
    expect(SRC).toMatch(
      /onClick=\{\(\) => \{[\s\S]*?dispatchEvent\([\s\S]*?employee-pond:open-messenger[\s\S]*?closeDialogue\(\);/,
    );
  });

  it('SSR-safe: dispatches only when window is defined', () => {
    expect(SRC).toMatch(/if \(typeof window === 'undefined'\) return;/);
  });
});

describe('FloatingMessenger — E9 external open-with-recipient listener', () => {
  const SRC = read('app/admin/components/FloatingMessenger.tsx');

  it("subscribes to 'employee-pond:open-messenger' on mount + cleans up on unmount", () => {
    expect(SRC).toMatch(/window\.addEventListener\('employee-pond:open-messenger', handler\)/);
    expect(SRC).toMatch(/window\.removeEventListener\('employee-pond:open-messenger', handler\)/);
  });

  it('the listener opens the widget immediately', () => {
    expect(SRC).toMatch(/setIsOpen\(true\);[\s\S]*?Reuse the most recent direct conversation/);
  });

  it("reads + normalizes the email from the event detail", () => {
    expect(SRC).toMatch(/const targetEmail = detail\?\.email\?\.trim\(\)\.toLowerCase\(\);/);
  });

  it('prefers an existing direct conversation when one already involves the recipient', () => {
    expect(SRC).toMatch(
      /const existing = conversations\.find\(\(c\) => \{[\s\S]*?c\.type !== 'direct'[\s\S]*?others\.includes\(targetEmail\)/,
    );
  });

  it('creates a new direct conversation when none exists', () => {
    expect(SRC).toMatch(
      /fetch\('\/api\/admin\/messages\/conversations', \{[\s\S]*?body: JSON\.stringify\(\{[\s\S]*?type: 'direct',[\s\S]*?participant_emails: \[targetEmail\]/,
    );
  });

  it('switches to the chat view + fetches the conversation messages', () => {
    expect(SRC).toMatch(/setView\('chat'\);\s*\n\s*fetchMessages\(/);
  });

  it("declares the user-email guard so the listener can't open the widget when no one's signed in", () => {
    expect(SRC).toMatch(/if \(!userEmail\) return;/);
  });
});
