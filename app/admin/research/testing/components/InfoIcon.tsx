// InfoIcon.tsx — Clickable help icon that expands to show detailed instructions.
// Used throughout the Testing Lab to provide contextual help.
'use client';

import { useState } from 'react';

interface InfoIconProps {
  /** Short title shown at the top of the help panel */
  title: string;
  /** Help content — supports newlines which render as paragraphs */
  content: string;
  /** Optional size override (default 16px) */
  size?: number;
}

export default function InfoIcon({ title, content, size = 16 }: InfoIconProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className="info-icon-wrap">
      <button
        className="info-icon"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        title={`Help: ${title}`}
        aria-label={`Help: ${title}`}
        style={{ width: size, height: size, fontSize: size * 0.7 }}
      >
        ?
      </button>
      {open && (
        <>
          <div className="info-icon__backdrop" onClick={() => setOpen(false)} />
          <div className="info-icon__panel">
            <div className="info-icon__panel-header">
              <span className="info-icon__panel-title">{title}</span>
              <button className="info-icon__panel-close" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="info-icon__panel-body">
              {content.split('\n\n').map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </div>
        </>
      )}
    </span>
  );
}
