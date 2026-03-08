// lib/cad/templates/legend.ts — Legend auto-population and defaults
import type { Feature } from '../types';
import type { LegendEntryConfig, LegendTemplateConfig } from './types';

export interface CodeStyleEntry {
  description: string;
  lineTypeId?: string;
  symbolId?: string;
  lineColor?: string;
  symbolColor?: string;
  lineWeight?: number;
}

/**
 * Auto-populate legend entries from feature layers and their code styles.
 * Deduplicates by description.
 */
export function autoPopulateLegend(
  features: Feature[],
  codeStyleMap: Map<string, CodeStyleEntry>,
): LegendEntryConfig[] {
  const seen = new Set<string>();
  const entries: LegendEntryConfig[] = [];

  for (const feature of features) {
    const props = feature.properties;
    const code = typeof props['alphaCode'] === 'string' ? props['alphaCode'] : '';
    if (!code) continue;
    if (seen.has(code)) continue;
    seen.add(code);

    const style = codeStyleMap.get(code);
    if (!style) continue;

    const isSymbol = feature.type === 'POINT' && style.symbolId;
    entries.push({
      label: style.description,
      sampleType: isSymbol ? 'SYMBOL' : 'LINE',
      lineTypeId: style.lineTypeId,
      symbolId: style.symbolId,
      color: style.lineColor ?? style.symbolColor ?? '#000000',
      lineWeight: style.lineWeight,
    });
  }

  return entries;
}

export const DEFAULT_LEGEND_CONFIG: LegendTemplateConfig = {
  position: { x: 0.5, y: 0.5 },
  width: 3.5,
  autoPopulate: true,
  columns: 1,
  showLineTypes: true,
  showSymbols: true,
  showColors: true,
  title: 'LEGEND',
  font: 'Arial',
  fontSize: 8,
  entries: [],
};
