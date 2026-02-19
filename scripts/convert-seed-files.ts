/**
 * convert-seed-files.ts
 *
 * Reads SQL seed files containing UPDATE learning_lessons SET content = '...'
 * statements, extracts the HTML, parses it into lesson blocks, and generates
 * companion seed files with INSERT INTO lesson_blocks statements.
 *
 * Usage:
 *   npx tsx scripts/convert-seed-files.ts
 *
 * Output:
 *   Creates scripts/converted/ directory with block-based companion SQL files.
 *   Also generates scripts/converted/_all_blocks.sql with all conversions combined.
 */

import { parse as parseHTML, HTMLElement } from 'node-html-parser';
import * as fs from 'fs';
import * as path from 'path';

// ── Types ────────────────────────────────────────────────────────────────

interface LessonBlock {
  block_type: string;
  content: Record<string, unknown>;
  order_index: number;
}

// ── Seed files with HTML content ─────────────────────────────────────────

const SEED_FILES = [
  'supabase_seed_acc_content_1335_wk1.sql',
  'supabase_seed_acc_content_1335_wk2.sql',
  'supabase_seed_acc_content_1335_wk3.sql',
  'supabase_seed_acc_content_1335_wk4.sql',
  'supabase_seed_acc_content_1335_wk5.sql',
  'supabase_seed_acc_content_1341_wk0.sql',
  'supabase_seed_acc_content_1341_wk1.sql',
  'supabase_seed_acc_content_1341_wk2.sql',
  'supabase_seed_acc_content_1341_wk3.sql',
  'supabase_seed_acc_content_1341_wk4.sql',
  'supabase_seed_acc_content_1341_wk5.sql',
  'supabase_seed_acc_content_1341_wk6.sql',
];

// ── SQL Extraction ───────────────────────────────────────────────────────

interface ExtractedLesson {
  lessonId: string;
  html: string;
  fileName: string;
}

function extractLessonContent(filePath: string): ExtractedLesson | null {
  const sql = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  // Extract lesson ID from header comment or WHERE clause
  const idMatch = sql.match(/WHERE id = '([a-f0-9-]+)'/);
  if (!idMatch) {
    console.warn(`  No lesson ID found in ${fileName}`);
    return null;
  }
  const lessonId = idMatch[1];

  // Extract HTML content — two patterns:
  // Pattern A: SET content = '\n<h2>...  (1335 files)
  // Pattern B: content = '\n<h2>...     (1341 files, content on its own line)
  let contentStart = sql.indexOf("SET content = '");
  let prefixLen = "SET content = '".length;

  if (contentStart === -1) {
    // Try pattern B: content = ' on its own line
    const contentMatch = sql.match(/\ncontent = '/);
    if (contentMatch && contentMatch.index !== undefined) {
      contentStart = contentMatch.index + 1; // skip the leading \n
      prefixLen = "content = '".length;
    }
  }

  if (contentStart === -1) {
    console.warn(`  No content found in ${fileName}`);
    return null;
  }

  // Find the start of actual HTML (skip the prefix)
  const htmlStart = contentStart + prefixLen;

  // The content ends before the closing single quote followed by a comma or WHERE
  // We need to find the end of the HTML content. The pattern ends with:
  // '\n,\n' (if followed by other SET clauses) or '\nWHERE' (if last SET)
  // Look for the closing pattern: a line that starts with "'" followed by ","  or just starts with WHERE
  let htmlEnd = -1;

  // Strategy: find lines after htmlStart that match the closing pattern
  // The HTML content ends with a single quote on its own line followed by comma or nothing
  const afterContent = sql.slice(htmlStart);

  // Find the first occurrence of a line that is just a single quote (closing the content string)
  // followed by a comma and then other SET clauses, or by WHERE
  // The pattern in these files is: content ends with \n'\n, then either more SET or WHERE
  // Let's look for '\n' followed by a SQL keyword line
  const endPatterns = [
    /\n',\s*\n\s*(description|title|learning_objectives|key_takeaways|estimated_minutes|status|xp_reward|resources|videos|tags)\s*=/,
    /\n'\s*\nWHERE/,
    /\n'\s*WHERE/,
  ];

  for (const pattern of endPatterns) {
    const match = afterContent.match(pattern);
    if (match && match.index !== undefined) {
      htmlEnd = htmlStart + match.index;
      break;
    }
  }

  if (htmlEnd === -1) {
    // Fallback: try to find the end by looking for a line with just a single quote
    const lines = afterContent.split('\n');
    let offset = 0;
    for (const line of lines) {
      if (line.trim() === "'" || line.trim() === "',") {
        htmlEnd = htmlStart + offset;
        break;
      }
      offset += line.length + 1;
    }
  }

  if (htmlEnd === -1) {
    console.warn(`  Could not find content end in ${fileName}`);
    return null;
  }

  const html = sql.slice(htmlStart, htmlEnd).trim();

  // Un-escape SQL single quotes
  const unescaped = html.replace(/''/g, "'");

  return { lessonId, html: unescaped, fileName };
}

// ── HTML to Blocks Parser ────────────────────────────────────────────────

function detectCalloutType(style: string): string | null {
  const s = style.toLowerCase();
  if (s.includes('#1a1a2e')) return 'formula';
  if (s.includes('#f0f4f8') || (s.includes('border-left') && s.includes('#2563eb'))) return 'note';
  if (s.includes('#fffbeb')) return 'example';
  if (s.includes('#ecfdf5')) return 'tip';
  if (s.includes('#fee2e2') || s.includes('#fef2f2') || (s.includes('border-left') && s.includes('#dc2626'))) return 'danger';
  if (s.includes('#fef3c7') || s.includes('#f59e0b')) return 'warning';
  if (s.includes('#eff6ff') || s.includes('#dbeafe')) return 'info';
  return null;
}

function parseHtmlToBlocks(htmlStr: string): LessonBlock[] {
  if (!htmlStr?.trim()) return [];

  const root = parseHTML(htmlStr, { lowerCaseTagName: true, comment: false });
  const blocks: LessonBlock[] = [];
  let pendingHtml = '';

  function flushPending() {
    const trimmed = pendingHtml.trim();
    if (!trimmed) return;
    blocks.push({ block_type: 'text', content: { html: trimmed }, order_index: 0 });
    pendingHtml = '';
  }

  function processNode(node: any) {
    if (node.nodeType === 3) {
      const text = node.rawText?.trim();
      if (text) pendingHtml += node.rawText;
      return;
    }
    if (!(node instanceof HTMLElement)) return;

    const tag = node.tagName?.toLowerCase();
    if (!tag) return;

    if (tag === 'hr') {
      flushPending();
      blocks.push({ block_type: 'divider', content: {}, order_index: 0 });
      return;
    }

    if (tag === 'table') {
      flushPending();
      const headers: string[] = [];
      const rows: string[][] = [];
      const theadThs = node.querySelectorAll('thead th');
      if (theadThs.length > 0) {
        theadThs.forEach((th: HTMLElement) => headers.push(th.innerHTML?.trim() || ''));
      }
      const tbodyTrs = node.querySelectorAll('tbody tr');
      if (tbodyTrs.length > 0) {
        tbodyTrs.forEach((tr: HTMLElement) => {
          const row: string[] = [];
          tr.querySelectorAll('td').forEach((td: HTMLElement) => row.push(td.innerHTML?.trim() || ''));
          if (row.length > 0) rows.push(row);
        });
      }
      if (headers.length === 0) {
        const allTrs = node.querySelectorAll('tr');
        if (allTrs.length > 0) {
          const firstTr = allTrs[0];
          const ths = firstTr.querySelectorAll('th');
          if (ths.length > 0) {
            ths.forEach((th: HTMLElement) => headers.push(th.innerHTML?.trim() || ''));
          } else {
            const tds = firstTr.querySelectorAll('td');
            tds.forEach((td: HTMLElement) => headers.push(td.innerHTML?.trim() || ''));
          }
          for (let i = 1; i < allTrs.length; i++) {
            const row: string[] = [];
            allTrs[i].querySelectorAll('td').forEach((td: HTMLElement) => row.push(td.innerHTML?.trim() || ''));
            if (row.length > 0) rows.push(row);
          }
        }
      }
      blocks.push({ block_type: 'table', content: { headers, rows }, order_index: 0 });
      return;
    }

    if (tag === 'img') {
      flushPending();
      blocks.push({
        block_type: 'image',
        content: {
          url: node.getAttribute('src') || '',
          alt: node.getAttribute('alt') || '',
          caption: '',
          alignment: 'center',
        },
        order_index: 0,
      });
      return;
    }

    if (tag === 'div') {
      const style = node.getAttribute('style') || '';
      const cls = node.getAttribute('class') || '';
      const calloutType = detectCalloutType(style);
      if (calloutType) {
        flushPending();
        blocks.push({
          block_type: 'callout',
          content: { type: calloutType, text: node.innerHTML.trim() },
          order_index: 0,
        });
        return;
      }
      if (cls.includes('callout') || cls.includes('alert') || cls.includes('note') || cls.includes('warning') || cls.includes('tip')) {
        flushPending();
        let type = 'info';
        if (cls.includes('warning') || cls.includes('danger')) type = 'warning';
        else if (cls.includes('tip') || cls.includes('success')) type = 'tip';
        else if (cls.includes('example')) type = 'example';
        else if (cls.includes('note')) type = 'note';
        blocks.push({ block_type: 'callout', content: { type, text: node.innerHTML.trim() }, order_index: 0 });
        return;
      }
      node.childNodes.forEach((child: any) => processNode(child));
      return;
    }

    if (tag === 'iframe') {
      flushPending();
      const src = node.getAttribute('src') || '';
      if (src.includes('youtube') || src.includes('youtu.be') || src.includes('vimeo')) {
        blocks.push({ block_type: 'video', content: { url: src, type: src.includes('vimeo') ? 'vimeo' : 'youtube', caption: '' }, order_index: 0 });
      } else {
        blocks.push({ block_type: 'embed', content: { url: src, height: parseInt(node.getAttribute('height') || '400', 10) }, order_index: 0 });
      }
      return;
    }

    if (tag === 'h2' || tag === 'h3') {
      flushPending();
      pendingHtml = node.outerHTML;
      return;
    }

    pendingHtml += node.outerHTML;
  }

  root.childNodes.forEach((child: any) => processNode(child));
  flushPending();

  return blocks.map((b, i) => ({ ...b, order_index: i }));
}

// ── SQL Output Generator ─────────────────────────────────────────────────

function escapeSQL(str: string): string {
  return str.replace(/'/g, "''");
}

function generateBlockSQL(lessonId: string, blocks: LessonBlock[], comment: string): string {
  if (blocks.length === 0) return '';

  const values = blocks.map((b) => {
    const contentJson = JSON.stringify(b.content);
    return `  (gen_random_uuid(), '${lessonId}', '${escapeSQL(b.block_type)}', '${escapeSQL(contentJson)}'::jsonb, ${b.order_index}, now(), now())`;
  });

  return [
    `-- ${comment}`,
    `-- Converted from legacy HTML to structured lesson blocks`,
    `DELETE FROM lesson_blocks WHERE lesson_id = '${lessonId}';`,
    `INSERT INTO lesson_blocks (id, lesson_id, block_type, content, order_index, created_at, updated_at)`,
    `VALUES`,
    values.join(',\n') + ';',
    ``,
    `-- Mark lesson as migrated (original HTML preserved as fallback)`,
    `UPDATE learning_lessons SET content_migrated = TRUE WHERE id = '${lessonId}';`,
    ``,
  ].join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────

function main() {
  const rootDir = path.resolve(process.cwd());
  const outDir = path.resolve(rootDir, 'scripts/converted');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log('=== Seed File to Blocks Converter ===\n');

  let allSQL = [
    '-- ============================================================================',
    '-- AUTO-GENERATED: All lesson block conversions from seed HTML content',
    '-- Run this AFTER the original seed files and content_migrated migration.',
    '-- Generated by: npx tsx scripts/convert-seed-files.ts',
    `-- Generated at: ${new Date().toISOString()}`,
    '-- ============================================================================',
    '',
    '-- Ensure content_migrated column exists',
    'ALTER TABLE learning_lessons ADD COLUMN IF NOT EXISTS content_migrated BOOLEAN DEFAULT FALSE;',
    '',
  ].join('\n');

  let totalFiles = 0;
  let totalBlocks = 0;
  const stats: { file: string; lessonId: string; blocks: number; types: string }[] = [];

  for (const seedFile of SEED_FILES) {
    const filePath = path.join(rootDir, seedFile);
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${seedFile}`);
      continue;
    }

    console.log(`Processing: ${seedFile}`);
    const extracted = extractLessonContent(filePath);

    if (!extracted) {
      console.log('  Skipped (no extractable content)\n');
      continue;
    }

    console.log(`  Lesson ID: ${extracted.lessonId}`);
    console.log(`  HTML length: ${extracted.html.length} chars`);

    const blocks = parseHtmlToBlocks(extracted.html);

    if (blocks.length === 0) {
      console.log('  No blocks extracted (empty content)\n');
      continue;
    }

    // Count block types
    const typeCounts: Record<string, number> = {};
    for (const b of blocks) {
      typeCounts[b.block_type] = (typeCounts[b.block_type] || 0) + 1;
    }
    const typesSummary = Object.entries(typeCounts)
      .map(([t, c]) => `${t}:${c}`)
      .join(', ');

    console.log(`  Blocks: ${blocks.length} (${typesSummary})`);

    // Generate SQL
    const comment = `${seedFile} — Lesson: ${extracted.lessonId}`;
    const blockSQL = generateBlockSQL(extracted.lessonId, blocks, comment);

    // Write individual file
    const outFile = path.join(outDir, seedFile.replace('.sql', '_blocks.sql'));
    fs.writeFileSync(outFile, blockSQL, 'utf-8');
    console.log(`  Written: ${path.relative(rootDir, outFile)}\n`);

    allSQL += '\n' + blockSQL + '\n';
    totalFiles++;
    totalBlocks += blocks.length;
    stats.push({ file: seedFile, lessonId: extracted.lessonId, blocks: blocks.length, types: typesSummary });
  }

  // Write combined file
  const combinedPath = path.join(outDir, '_all_blocks.sql');
  fs.writeFileSync(combinedPath, allSQL, 'utf-8');

  // Summary
  console.log('=== Conversion Summary ===');
  console.log(`Files processed: ${totalFiles}`);
  console.log(`Total blocks:    ${totalBlocks}`);
  console.log(`Combined SQL:    ${path.relative(rootDir, combinedPath)}`);
  console.log('');
  console.log('Per-file details:');
  for (const s of stats) {
    console.log(`  ${s.file}`);
    console.log(`    Lesson: ${s.lessonId} | Blocks: ${s.blocks} | Types: ${s.types}`);
  }
  console.log('');
  console.log('Next steps:');
  console.log('1. Review the generated SQL in scripts/converted/');
  console.log('2. Run supabase_migration_content_migrated.sql if not already done');
  console.log('3. Run scripts/converted/_all_blocks.sql against your database');
}

main();
