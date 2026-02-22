// app/admin/components/FloatingActionMenu.tsx — Collapsible green toolbar for FAB buttons
'use client';

import { useState, useEffect, useCallback } from 'react';

interface FloatingActionMenuProps {
  children: React.ReactNode;
}

/**
 * Wraps the three floating action buttons (Messages, Flag an Issue, Fieldbook)
 * in a green pill-shaped container with a white collapse/expand arrow.
 * The arrow sits on the left and toggles the menu open/closed.
 */
export default function FloatingActionMenu({ children }: FloatingActionMenuProps) {
  const [expanded, setExpanded] = useState(true);
  const [hasOpenPanel, setHasOpenPanel] = useState(false);

  const checkOpenPanels = useCallback(() => {
    const panels = document.querySelectorAll('.fb, .discussion-panel, .messenger-panel');
    const anyOpen = Array.from(panels).some(p => {
      const style = window.getComputedStyle(p);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    setHasOpenPanel(anyOpen);
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(checkOpenPanels);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    checkOpenPanels();
    return () => observer.disconnect();
  }, [checkOpenPanels]);

  const isVisible = expanded || hasOpenPanel;

  return (
    <div className={`fab-menu ${isVisible ? 'fab-menu--expanded' : 'fab-menu--collapsed'}`}>
      {/* Toggle arrow — left side of the green bar */}
      <button
        className="fab-menu__toggle"
        onClick={() => setExpanded(prev => !prev)}
        aria-label={isVisible ? 'Collapse quick actions' : 'Expand quick actions'}
        title={isVisible ? 'Collapse' : 'Quick Actions'}
      >
        <svg
          className="fab-menu__toggle-icon"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d={isVisible ? 'M9 2L4 7L9 12' : 'M5 2L10 7L5 12'}
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* FAB buttons container */}
      <div className="fab-menu__buttons">
        {children}
      </div>
    </div>
  );
}
