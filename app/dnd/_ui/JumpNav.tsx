'use client';
// JumpNav — in-page section links that scroll smoothly WITHOUT pushing a history entry per click.
// A plain `<a href="#section">` pushes a hash entry each time, so Back "jumps up and down" the same page
// and needs several presses before it leaves (Slice 37). This scrolls the target into view and REPLACES
// the hash instead of pushing, so Back returns to the previous page in one press.
import styles from './hextech.module.css';

export interface JumpItem {
  id: string;
  label: string;
}

export default function JumpNav({ items }: { items: JumpItem[] }) {
  const go = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Update the hash without adding a history entry — the whole point of the fix.
      if (typeof history !== 'undefined') history.replaceState(null, '', `#${id}`);
    }
  };
  return (
    <nav
      className={styles.framedPanel}
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 12px', border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)' }}
      aria-label="Jump to a section"
    >
      {items.map((i) => (
        // Each item is a distinct ◆-bulleted pill so the index reads as separate items, not a run of text.
        <a key={i.id} href={`#${i.id}`} onClick={(e) => go(e, i.id)} className={styles.jumpNavItem}>
          {i.label}
        </a>
      ))}
    </nav>
  );
}
