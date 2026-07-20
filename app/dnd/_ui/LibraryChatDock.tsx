'use client';
// LibraryChatDock — the rules librarian as a floating bottom-right assistant.
//
// The library ALREADY had a working grounded AI chat (LibraryChat + /api/dnd/library/chat,
// retrieving from the system-scoped entries via systemGroundingBlock). What it lacked was
// discoverability: it rendered as an inline <section> at the very bottom of a long page, so
// you had to scroll past every rule on the page to find the thing that answers questions
// about them. The character sheet solved the same problem with a fixed "✦ Edit with AI"
// launcher, and the owner asked for that here (2026-07-19).
//
// So this is a SHELL, not a second chat: it reuses sheetchat.module.css for pixel-identical
// chrome and renders the existing <LibraryChat> inside. Deliberately no duplicated
// conversation logic — the ask/queue/cross-system-switch behaviour stays in one place, and
// `chat-ui.test.ts` (which asserts on LibraryChat's SOURCE TEXT) keeps passing untouched.
import { useState } from 'react';
import LibraryChat from './LibraryChat';
import styles from './sheetchat.module.css';

export default function LibraryChatDock({
  aiConfigured, system, systemName,
}: {
  aiConfigured: boolean;
  /** Pins the chat to one game system on a /dnd/library/[key] page. Omitted on the index,
   *  where the chat offers its own system picker. */
  system?: string;
  systemName?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className={styles.root}>
        <button type="button" onClick={() => setOpen(true)} className={styles.launcher}>
          <span aria-hidden className={styles.spark}>✦</span> Ask the rules
        </button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* No useResizable here: the inner LibraryChat manages its own sizing, and stacking a
          second resize grip on a bottom-anchored dock fights it (the sheet's dock has to pass
          invert:{x,y} for exactly that reason). Fixed panel size keeps the two independent. */}
      <div className={styles.panel}>
        <div className={styles.head}>
          <span aria-hidden className={styles.spark}>✦</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.headTitle}>RULES LIBRARIAN</div>
            <div className={styles.headSub}>
              {systemName ? `Answers from the ${systemName} library` : 'Answers from the rules library'}
            </div>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className={styles.close}>×</button>
        </div>

        <div className={styles.stream} style={{ padding: 0 }}>
          <LibraryChat aiConfigured={aiConfigured} system={system} title="" embedded />
        </div>
      </div>
    </div>
  );
}
