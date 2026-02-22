// app/admin/research/components/DrawingContextMenu.tsx — Right-click context menu for drawing elements
'use client';

import { useEffect, useRef } from 'react';
import type { DrawingElement } from '@/types/research';

// ── Menu Action Types ───────────────────────────────────────────────────────

export type ContextMenuAction =
  | 'edit_style'       // Open style editor for this element
  | 'change_color'     // Quick color picker
  | 'change_width'     // Quick width adjustment
  | 'change_pattern'   // Quick line pattern
  | 'resize'           // Enter resize mode
  | 'move'             // Enter move mode
  | 'rotate'           // Enter rotate mode
  | 'duplicate'        // Duplicate element
  | 'delete'           // Delete / hide user annotation
  | 'send_to_front'    // Bring to front of z-order
  | 'send_to_back'     // Send to back of z-order
  | 'lock'             // Lock element
  | 'unlock'           // Unlock element
  | 'hide'             // Hide element
  | 'show'             // Show element
  | 'edit_text'        // Edit text content (text elements only)
  | 'change_font_size' // Change text font size
  | 'change_font'      // Change font family
  | 'bold'             // Toggle bold
  | 'italic'           // Toggle italic
  | 'change_symbol'    // Change symbol type (symbols only)
  | 'change_size'      // Change symbol/image size
  | 'replace_image'    // Replace image source
  | 'crop_image'       // Crop image
  | 'view_details'     // Open element detail panel
  | 'view_source'      // View source document
  | 'add_note'         // Add user note
  | 'copy_coords'      // Copy coordinate info
  | 'measure_from'     // Start measure from this point
  | 'revert_to_original';  // Revert modified element to original AI-generated state

interface MenuSection {
  label?: string;
  items: {
    action: ContextMenuAction;
    label: string;
    icon?: string;
    disabled?: boolean;
    danger?: boolean;
  }[];
}

// ── Props ───────────────────────────────────────────────────────────────────

interface DrawingContextMenuProps {
  x: number;
  y: number;
  element: DrawingElement | null;
  isUserAnnotation: boolean;  // whether this is a user-created annotation
  onAction: (action: ContextMenuAction, element: DrawingElement | null) => void;
  onClose: () => void;
}

export default function DrawingContextMenu({
  x,
  y,
  element,
  isUserAnnotation,
  onAction,
  onClose,
}: DrawingContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Position adjustment to keep menu in viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  // Build menu sections based on element type
  const sections = buildMenuSections(element, isUserAnnotation);

  return (
    <div
      ref={menuRef}
      className="research-context-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      {/* Header showing what was clicked */}
      {element && (
        <div className="research-context-menu__header">
          {element.feature_class.replace(/_/g, ' ')} — {element.element_type}
          {element.user_modified && (
            <span className="research-context-menu__edited-badge"> *edited</span>
          )}
        </div>
      )}
      {!element && (
        <div className="research-context-menu__header">
          Canvas
        </div>
      )}

      {sections.map((section, sIdx) => (
        <div key={sIdx} className="research-context-menu__section">
          {section.label && (
            <div className="research-context-menu__section-label">{section.label}</div>
          )}
          {section.items.map(item => (
            <button
              key={item.action}
              className={`research-context-menu__item ${item.danger ? 'research-context-menu__item--danger' : ''} ${item.disabled ? 'research-context-menu__item--disabled' : ''}`}
              onClick={() => {
                if (!item.disabled) {
                  onAction(item.action, element);
                  onClose();
                }
              }}
              disabled={item.disabled}
              role="menuitem"
            >
              {item.icon && <span className="research-context-menu__icon">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Build menu sections ─────────────────────────────────────────────────────

function buildMenuSections(element: DrawingElement | null, isUserAnnotation: boolean): MenuSection[] {
  // No element clicked — canvas context menu
  if (!element) {
    return [
      {
        items: [
          { action: 'measure_from', label: 'Measure Distance', icon: '📏' },
          { action: 'copy_coords', label: 'Copy Coordinates', icon: '📋' },
        ],
      },
    ];
  }

  const sections: MenuSection[] = [];
  const isText = element.element_type === 'label' || element.element_type === 'callout';
  const isSymbol = element.element_type === 'symbol' || element.element_type === 'point';
  const isLocked = element.locked;

  // Style section — always available for elements
  const styleItems: MenuSection['items'] = [
    { action: 'edit_style', label: 'Edit Style...', icon: '🎨' },
    { action: 'change_color', label: 'Change Color', icon: '🔵' },
    { action: 'change_width', label: 'Line Width', icon: '━' },
    { action: 'change_pattern', label: 'Line Pattern', icon: '╌' },
  ];

  // Text-specific styling
  if (isText) {
    styleItems.push(
      { action: 'edit_text', label: 'Edit Text', icon: '✏️' },
      { action: 'change_font_size', label: 'Font Size', icon: 'A' },
      { action: 'change_font', label: 'Font Family', icon: '𝗔' },
      { action: 'bold', label: 'Bold', icon: 'B' },
      { action: 'italic', label: 'Italic', icon: 'I' },
    );
  }

  // Symbol-specific styling
  if (isSymbol) {
    styleItems.push(
      { action: 'change_symbol', label: 'Change Symbol', icon: '⊕' },
      { action: 'change_size', label: 'Change Size', icon: '↕' },
    );
  }

  sections.push({ label: 'Style', items: styleItems });

  // Transform section
  const transformItems: MenuSection['items'] = [
    { action: 'move', label: 'Move', icon: '✥', disabled: isLocked },
    { action: 'resize', label: 'Resize', icon: '⤡', disabled: isLocked },
    { action: 'rotate', label: 'Rotate', icon: '↻', disabled: isLocked },
    { action: 'duplicate', label: 'Duplicate', icon: '⧉' },
    { action: 'send_to_front', label: 'Bring to Front', icon: '⬆' },
    { action: 'send_to_back', label: 'Send to Back', icon: '⬇' },
  ];
  sections.push({ label: 'Transform', items: transformItems });

  // Image-specific
  if (element.element_type === 'hatch') {
    sections.push({
      label: 'Image',
      items: [
        { action: 'replace_image', label: 'Replace Image', icon: '🔄' },
        { action: 'crop_image', label: 'Crop Image', icon: '✂' },
        { action: 'change_size', label: 'Resize Image', icon: '↕' },
      ],
    });
  }

  // Info section
  const infoItems: MenuSection['items'] = [
    { action: 'view_details', label: 'View Details', icon: 'ℹ' },
    { action: 'add_note', label: 'Add Note', icon: '📝' },
    { action: 'copy_coords', label: 'Copy Coordinates', icon: '📋' },
  ];

  if (element.source_references?.length > 0) {
    infoItems.push({ action: 'view_source', label: 'View Source Document', icon: '📄' });
  }

  infoItems.push({ action: 'measure_from', label: 'Measure From Here', icon: '📏' });
  sections.push({ label: 'Info', items: infoItems });

  // Visibility & lock
  const controlItems: MenuSection['items'] = [];
  if (element.visible) {
    controlItems.push({ action: 'hide', label: 'Hide Element', icon: '👁' });
  } else {
    controlItems.push({ action: 'show', label: 'Show Element', icon: '👁' });
  }
  if (element.locked) {
    controlItems.push({ action: 'unlock', label: 'Unlock', icon: '🔓' });
  } else {
    controlItems.push({ action: 'lock', label: 'Lock', icon: '🔒' });
  }

  // Revert to original for modified AI-generated elements
  if (element.user_modified && !isUserAnnotation) {
    controlItems.push({ action: 'revert_to_original', label: 'Revert to Original', icon: '↩' });
  }

  // Delete for user annotations
  if (isUserAnnotation) {
    controlItems.push({ action: 'delete', label: 'Delete', icon: '🗑', danger: true });
  }

  sections.push({ items: controlItems });

  return sections;
}
