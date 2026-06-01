// lib/cad/feature-row-label.ts
//
// cad-trv-fidelity Slice 3 — human-friendly label for a feature row in
// the Layer panel tree. POINTs show their real point name + code
// ("Point 309 · 20fnd"), TEXT shows a snippet of its content
// (`Text "asphalt parking"`), and everything else keeps the
// `TYPE – name` form. Pure: no DOM / React / store deps.

import type { Feature } from './types';

/** Max characters of TEXT content shown in the row before ellipsis. */
export const TEXT_SNIPPET_MAX = 24;

/** Build the Layer-panel row label for a feature. */
export function featureRowLabel(feat: Feature): string {
  if (feat.type === 'POINT') {
    const p = feat.properties ?? {};
    const name =
      typeof p.pointName === 'string' && p.pointName
        ? p.pointName
        : typeof p.name === 'string'
          ? p.name
          : '';
    const code = typeof p.code === 'string' ? p.code.trim() : '';
    const parts = ['Point'];
    if (name) parts.push(name);
    if (code && code !== name) parts.push(`· ${code}`);
    return parts.join(' ');
  }
  if (feat.type === 'TEXT') {
    const raw = typeof feat.geometry?.textContent === 'string' ? feat.geometry.textContent : '';
    const oneLine = raw.replace(/\s+/g, ' ').trim();
    if (!oneLine) return 'Text';
    const snippet = oneLine.length > TEXT_SNIPPET_MAX ? `${oneLine.slice(0, TEXT_SNIPPET_MAX)}…` : oneLine;
    return `Text "${snippet}"`;
  }
  const name = typeof feat.properties?.name === 'string' ? feat.properties.name : '';
  return name ? `${feat.type} – ${name}` : feat.type;
}
