// CodeContextMenu.tsx — right-click context menu for the CodeViewer
'use client';

import { useEffect, useRef } from 'react';

export type ContextMenuAction =
  | 'view-dependencies'
  | 'ai-analyze'
  | 'ai-chat'
  | 'copy'
  | 'find-references'
  | 'explain';

interface CodeContextMenuProps {
  x: number;
  y: number;
  selectedText?: string;
  file?: string;
  line?: number;
  onClose: () => void;
  onAction: (action: ContextMenuAction) => void;
}

export default function CodeContextMenu({
  x,
  y,
  selectedText,
  onClose,
  onAction,
}: CodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const hasSelection = Boolean(selectedText?.trim());

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const handle = (action: ContextMenuAction) => {
    onAction(action);
    onClose();
  };

  const items: { label: string; action: ContextMenuAction; disabled?: boolean }[] = [
    { label: 'View Dependencies', action: 'view-dependencies' },
    { label: 'AI Analysis', action: 'ai-analyze', disabled: !hasSelection },
    { label: 'Chat About This Code', action: 'ai-chat' },
    { label: 'Explain', action: 'explain' },
    { label: 'Copy', action: 'copy' },
    { label: 'Find References', action: 'find-references', disabled: !hasSelection },
  ];

  return (
    <div
      ref={menuRef}
      className="testing-lab__context-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      {items.map((item) => (
        <button
          key={item.action}
          className={`testing-lab__context-menu__item ${item.disabled ? 'testing-lab__context-menu__item--disabled' : ''}`}
          onClick={() => !item.disabled && handle(item.action)}
          disabled={item.disabled}
          role="menuitem"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
