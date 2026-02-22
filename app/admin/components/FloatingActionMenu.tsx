// app/admin/components/FloatingActionMenu.tsx — Accordion wrapper for FAB buttons
'use client';

import { useState, useEffect, useCallback } from 'react';

interface FloatingActionMenuProps {
  children: React.ReactNode;
}

/**
 * Wraps the three floating action buttons (Messages, Flag an Issue, Fieldbook)
 * in an accordion-style container. When collapsed, shows a small toggle arrow.
 * When expanded, reveals the three buttons with a smooth slide animation.
 */
export default function FloatingActionMenu({ children }: FloatingActionMenuProps) {
  const [expanded, setExpanded] = useState(true);
  // Track if any child panel is open (if so, always show buttons)
  const [hasOpenPanel, setHasOpenPanel] = useState(false);

  // Watch for open panels: if any FAB panel (fb, discussion-panel, messenger-panel) is visible
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
      {/* Toggle button */}
      <button
        className={`fab-menu__toggle ${isVisible ? 'fab-menu__toggle--expanded' : ''}`}
        onClick={() => setExpanded(prev => !prev)}
        aria-label={isVisible ? 'Collapse quick actions' : 'Expand quick actions'}
        title={isVisible ? 'Collapse' : 'Quick Actions'}
      >
        <svg
          className="fab-menu__toggle-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d={isVisible ? 'M10 3L5 8L10 13' : 'M6 3L11 8L6 13'}
            stroke="currentColor"
            strokeWidth="2"
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
