// Installing without a store account (PWA plan W5).
//
// `/admin/install` originally offered TestFlight for iPhone and a direct APK for Android — a model
// that needs an Apple Developer account ($99/yr) and a Play account ($25). The owner's ask was
// explicitly to avoid both. The app already has what a PWA install needs: a manifest, and since W2 a
// service worker scoped to /admin/.
//
// iOS IS THE WHOLE REASON THIS CARD EXISTS. Android offers its own install prompt; iOS offers
// nothing, and push notifications there work ONLY from a home-screen install. So on iOS the steps
// have to be spelled out, or the push capability is built and unreachable — this codebase's most
// frequent defect, and a poor place to repeat it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const page = fs.readFileSync(
  path.join(process.cwd(), 'app/admin/install/page.tsx'), 'utf8');

describe('the browser-install route is offered at all', () => {
  it('renders a PWA card on the install page', () => {
    expect(page).toContain('<PwaCard platform={platform} />');
  });

  it('says plainly that no store is involved', () => {
    // The page's other two options both require a paid developer account. A user needs to know this
    // one does not, or they will assume it is the same deal.
    expect(page).toContain('no app store');
    expect(page).toContain('no account needed');
  });
});

describe('iOS gets real steps, because it gets no prompt', () => {
  it('names the Share button and Add to Home Screen', () => {
    expect(page).toContain('Add to Home Screen');
    expect(page).toMatch(/Share<\/strong> button/);
  });

  it('tells the user to open from the icon, not from Safari', () => {
    // The distinction that decides whether notifications ever arrive.
    expect(page).toContain('not from Safari');
  });

  it('states the iOS notification rule explicitly', () => {
    // The one rule that silently defeats push. A crew member who skips the install simply never
    // receives an alert and has no way to know why.
    expect(page).toContain('required for notifications');
    expect(page).toContain('only from the home-screen icon');
  });
});

describe('Android gets its own, shorter path', () => {
  it('points at Chrome\'s install item rather than the iOS steps', () => {
    expect(page).toContain('Install app');
  });

  it('acknowledges Chrome may prompt on its own', () => {
    expect(page).toContain('automatically');
  });
});

describe('it does not nag someone who already installed', () => {
  it('detects standalone display mode', () => {
    expect(page).toContain("matchMedia?.('(display-mode: standalone)')");
  });

  it('also handles iOS Safari, which predates that media query', () => {
    // iOS reports this on navigator instead. Checking only the media query would show install
    // instructions to someone already inside the installed app.
    expect(page).toContain('nav.standalone === true');
  });

  it('shows a confirmation instead of instructions when installed', () => {
    expect(page).toContain('You are running the installed app');
  });
});

describe('desktop is told to switch devices rather than shown steps that will not work', () => {
  it('says to open the page on a phone', () => {
    expect(page).toContain('Open this page on your phone');
  });
});
