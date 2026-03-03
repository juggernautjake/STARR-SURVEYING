// lib/cad/codes/collapse-map.ts
import { MASTER_CODE_LIBRARY } from './code-library';

const COLLAPSE_MAP = new Map<string, string>();
for (const code of MASTER_CODE_LIBRARY) {
  if (code.collapses && code.numericCode !== code.simplifiedCode) {
    COLLAPSE_MAP.set(code.numericCode, code.simplifiedCode);
  }
}

export function getSimplifiedCode(numericCode: string): string {
  return COLLAPSE_MAP.get(numericCode) ?? numericCode;
}

export function willCollapse(numericCode: string): boolean {
  return COLLAPSE_MAP.has(numericCode);
}

export function getCollapseTable(): { from: string; to: string; description: string }[] {
  return MASTER_CODE_LIBRARY
    .filter(c => c.collapses)
    .map(c => ({
      from: `${c.alphaCode}/${c.numericCode} (${c.description})`,
      to: `${c.simplifiedCode} (${c.simplifiedDescription})`,
      description: `${c.description} → ${c.simplifiedDescription}`,
    }));
}
