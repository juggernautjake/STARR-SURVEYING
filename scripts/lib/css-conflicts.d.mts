// scripts/lib/css-conflicts.d.ts — types for the shared conflict detector.
//
// The implementation is plain ESM (`css-conflicts.mjs`) so `node scripts/design-conflict-report.mjs`
// runs it with no build step. This file is what lets the vitest gate import the same functions and
// still be type-checked, rather than each side growing its own copy — which is the precise failure
// mode the module exists to catch.

export interface Declaration {
  /** Repo-relative path, forward slashes. */
  file: string;
  /** 1-indexed line of the selector, true to the original file. */
  line: number;
  /** The rule body, whitespace-collapsed, for comparing two declarations. */
  body: string;
}

export interface DuplicateProp {
  file: string;
  line: number;
  selector: string;
  prop: string;
  /** The value that never renders. */
  first: string;
  /** The value that wins. */
  second: string;
}

export interface Rule {
  selector: string;
  body: string;
  line: number;
  /** False when the rule sits inside `@media`/`@supports`/`@container`. */
  topLevel: boolean;
  file: string;
}

export interface Redefinition {
  cls: string;
  places: Declaration[];
}

export function walk(dir: string, test: (name: string) => boolean, out?: string[]): string[];
export function isPlainCss(name: string): boolean;
export function isFallbackPair(first: string, second: string): boolean;
export function parseSheet(file: string, rootRel: string): Rule[];
export function collectDeclarations(
  roots: string[],
  ROOT: string,
): { declarations: Map<string, Declaration[]>; duplicateProps: DuplicateProp[] };
export function findRedefined(declarations: Map<string, Declaration[]>): Redefinition[];
