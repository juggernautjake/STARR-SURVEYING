// app/api/admin/research/testing/dependencies/route.ts
// Analyzes worker/src TypeScript files and returns an import/export graph.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import fs from 'fs';
import path from 'path';

export interface FileNode {
  path: string;
  exports: string[];
  imports: string[];
}

export interface ImportEdge {
  from: string;
  to: string;
  symbols: string[];
}

interface DependencyResult {
  files: FileNode[];
  imports: ImportEdge[];
}

// 5-minute cache
let cache: { data: DependencyResult; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function findTsFiles(dir: string, base: string, results: string[] = []): string[] {
  if (results.length >= 200) return results;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (results.length >= 200) break;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findTsFiles(full, base, results);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(path.relative(base, full));
    }
  }
  return results;
}

function extractExports(content: string): string[] {
  const exports: string[] = [];
  const exportRe = /^export\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = exportRe.exec(content)) !== null) {
    exports.push(m[1]);
  }
  const namedRe = /^export\s*\{([^}]+)\}/gm;
  while ((m = namedRe.exec(content)) !== null) {
    const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean);
    exports.push(...names);
  }
  return [...new Set(exports)];
}

function extractImports(content: string, currentFile: string, baseDir: string): { imports: string[]; edges: ImportEdge[] } {
  const imports: string[] = [];
  const edges: ImportEdge[] = [];
  const importRe = /^import\s+(?:type\s+)?(?:\{([^}]*)\}|([A-Za-z_$][A-Za-z0-9_$]*))?\s*(?:,\s*\{([^}]*)\})?\s*from\s+['"]([^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(content)) !== null) {
    const specifier = m[4];
    if (!specifier.startsWith('.')) continue;
    const resolved = path
      .normalize(path.join(path.dirname(path.join(baseDir, currentFile)), specifier))
      .replace(/\\/g, '/');
    const rel = path.relative(baseDir, resolved).replace(/\\/g, '/');
    const target = rel.endsWith('.ts') ? rel : rel + '.ts';
    if (!imports.includes(target)) imports.push(target);
    const symbolsRaw = ((m[1] || '') + ',' + (m[3] || '')).trim().replace(/^,|,$/g, '');
    const symbols = symbolsRaw
      ? symbolsRaw.split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
      : [];
    edges.push({ from: currentFile, to: target, symbols });
  }
  return { imports, edges };
}

async function buildDependencyGraph(): Promise<DependencyResult> {
  const workerSrc = path.join(process.cwd(), 'worker', 'src');
  const files = findTsFiles(workerSrc, workerSrc);

  const fileNodes: FileNode[] = [];
  const allEdges: ImportEdge[] = [];

  for (const file of files) {
    const fullPath = path.join(workerSrc, file);
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }
    const exports = extractExports(content);
    const { imports, edges } = extractImports(content, file, workerSrc);
    fileNodes.push({ path: file, exports, imports });
    allEdges.push(...edges);
  }

  return { files: fileNodes, imports: allEdges };
}

async function handler(req: NextRequest) {
  const session = await auth();
  if (!session || !isDeveloper(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const data = await buildDependencyGraph();
  cache = { data, ts: Date.now() };
  return NextResponse.json(data);
}

export const POST = withErrorHandler(handler);
