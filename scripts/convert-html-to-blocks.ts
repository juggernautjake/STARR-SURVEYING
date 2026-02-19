/**
 * convert-html-to-blocks.ts
 *
 * Server-side script to convert legacy HTML content in learning_lessons
 * to structured lesson_blocks entries.
 *
 * Usage:
 *   npx tsx scripts/convert-html-to-blocks.ts [options]
 *
 * Options:
 *   --dry-run       Parse and display blocks without writing to DB
 *   --lesson-id=ID  Convert a single lesson by UUID
 *   --module-id=ID  Convert all lessons in a module by UUID
 *   --limit=N       Process at most N lessons (default: all)
 *   --force         Re-convert even if already migrated
 *   --sql-output    Generate SQL INSERT statements instead of DB writes
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { parse as parseHTML, HTMLElement } from 'node-html-parser';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Types ────────────────────────────────────────────────────────────────

interface LessonBlock {
  block_type: string;
  content: Record<string, unknown>;
  order_index: number;
}

interface Lesson {
  id: string;
  title: string;
  module_id: string;
  content: string | null;
  content_migrated: boolean;
}

// ── CLI Args ─────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    dryRun: false,
    lessonId: '',
    moduleId: '',
    limit: 0,
    force: false,
    sqlOutput: false,
  };
  for (const arg of args) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--sql-output') opts.sqlOutput = true;
    else if (arg.startsWith('--lesson-id=')) opts.lessonId = arg.split('=')[1];
    else if (arg.startsWith('--module-id=')) opts.moduleId = arg.split('=')[1];
    else if (arg.startsWith('--limit=')) opts.limit = parseInt(arg.split('=')[1], 10);
  }
  return opts;
}

// ── HTML to Blocks Parser ────────────────────────────────────────────────
// Server-side equivalent of the client-side parseHtmlToBlocks()

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

  const root = parseHTML(htmlStr, {
    lowerCaseTagName: true,
    comment: false,
  });

  const blocks: LessonBlock[] = [];
  let pendingHtml = '';

  function flushPending() {
    const trimmed = pendingHtml.trim();
    if (!trimmed) return;
    blocks.push({ block_type: 'text', content: { html: trimmed }, order_index: 0 });
    pendingHtml = '';
  }

  function processNode(node: any) {
    // Skip text-only nodes that are just whitespace
    if (node.nodeType === 3) {
      const text = node.rawText?.trim();
      if (text) pendingHtml += node.rawText;
      return;
    }

    // Only process HTMLElements
    if (!(node instanceof HTMLElement)) return;

    const tag = node.tagName?.toLowerCase();
    if (!tag) return;

    // HR → divider block
    if (tag === 'hr') {
      flushPending();
      blocks.push({ block_type: 'divider', content: {}, order_index: 0 });
      return;
    }

    // TABLE → table block
    if (tag === 'table') {
      flushPending();
      const headers: string[] = [];
      const rows: string[][] = [];

      // Try thead > th first
      const theadThs = node.querySelectorAll('thead th');
      if (theadThs.length > 0) {
        theadThs.forEach((th: HTMLElement) => headers.push(th.innerHTML?.trim() || ''));
      }

      // Get tbody rows
      const tbodyTrs = node.querySelectorAll('tbody tr');
      if (tbodyTrs.length > 0) {
        tbodyTrs.forEach((tr: HTMLElement) => {
          const row: string[] = [];
          tr.querySelectorAll('td').forEach((td: HTMLElement) => row.push(td.innerHTML?.trim() || ''));
          if (row.length > 0) rows.push(row);
        });
      }

      // Fallback: no thead, try first row for headers
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
          // Process remaining rows
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

    // IMG → image block
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

    // DIV → check for callout patterns
    if (tag === 'div') {
      const style = node.getAttribute('style') || '';
      const cls = node.getAttribute('class') || '';

      // Check for callout by inline style
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

      // Check for callout by class name
      if (cls.includes('callout') || cls.includes('alert') || cls.includes('note') || cls.includes('warning') || cls.includes('tip')) {
        flushPending();
        let type = 'info';
        if (cls.includes('warning') || cls.includes('danger')) type = 'warning';
        else if (cls.includes('tip') || cls.includes('success')) type = 'tip';
        else if (cls.includes('example')) type = 'example';
        else if (cls.includes('note')) type = 'note';
        blocks.push({
          block_type: 'callout',
          content: { type, text: node.innerHTML.trim() },
          order_index: 0,
        });
        return;
      }

      // Non-callout div: recurse into children
      node.childNodes.forEach((child: any) => processNode(child));
      return;
    }

    // IFRAME → embed block (YouTube, Vimeo, etc.)
    if (tag === 'iframe') {
      flushPending();
      const src = node.getAttribute('src') || '';
      if (src.includes('youtube') || src.includes('youtu.be') || src.includes('vimeo')) {
        blocks.push({
          block_type: 'video',
          content: { url: src, type: src.includes('vimeo') ? 'vimeo' : 'youtube', caption: '' },
          order_index: 0,
        });
      } else {
        blocks.push({
          block_type: 'embed',
          content: { url: src, height: parseInt(node.getAttribute('height') || '400', 10) },
          order_index: 0,
        });
      }
      return;
    }

    // H2, H3 → start a new text section
    if (tag === 'h2' || tag === 'h3') {
      flushPending();
      pendingHtml = node.outerHTML;
      return;
    }

    // Everything else (p, ul, ol, h4, pre, blockquote, etc.) → accumulate into text
    pendingHtml += node.outerHTML;
  }

  root.childNodes.forEach((child: any) => processNode(child));
  flushPending();

  // Assign order indexes
  return blocks.map((b, i) => ({ ...b, order_index: i }));
}

// ── SQL Output Generator ─────────────────────────────────────────────────

function escapeSQL(str: string): string {
  return str.replace(/'/g, "''");
}

function blocksToSQL(lessonId: string, blocks: LessonBlock[]): string {
  if (blocks.length === 0) return '';

  const values = blocks.map((b) => {
    const contentJson = JSON.stringify(b.content);
    return `  (gen_random_uuid(), '${lessonId}', '${escapeSQL(b.block_type)}', '${escapeSQL(contentJson)}'::jsonb, ${b.order_index}, now(), now())`;
  });

  return [
    `-- Lesson: ${lessonId}`,
    `DELETE FROM lesson_blocks WHERE lesson_id = '${lessonId}';`,
    `INSERT INTO lesson_blocks (id, lesson_id, block_type, content, order_index, created_at, updated_at)`,
    `VALUES`,
    values.join(',\n') + ';',
    `UPDATE learning_lessons SET content_migrated = TRUE WHERE id = '${lessonId}';`,
    '',
  ].join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  console.log('=== HTML to Blocks Converter ===');
  console.log(`Mode: ${opts.dryRun ? 'DRY RUN' : opts.sqlOutput ? 'SQL OUTPUT' : 'LIVE DB WRITE'}`);
  if (opts.force) console.log('Force mode: will re-convert already migrated lessons');
  console.log('');

  // Build query
  let query = supabase
    .from('learning_lessons')
    .select('id, title, module_id, content, content_migrated')
    .not('content', 'is', null)
    .neq('content', '')
    .is('deleted_at', null);

  if (!opts.force) {
    query = query.or('content_migrated.is.null,content_migrated.eq.false');
  }

  if (opts.lessonId) {
    query = query.eq('id', opts.lessonId);
  }
  if (opts.moduleId) {
    query = query.eq('module_id', opts.moduleId);
  }

  query = query.order('module_id').order('order_index');

  if (opts.limit > 0) {
    query = query.limit(opts.limit);
  }

  const { data: lessons, error } = await query;

  if (error) {
    console.error('Error fetching lessons:', error);
    process.exit(1);
  }

  if (!lessons || lessons.length === 0) {
    console.log('No lessons found to convert.');
    console.log('All lessons may already be migrated, or none have HTML content.');
    return;
  }

  console.log(`Found ${lessons.length} lesson(s) to convert.\n`);

  let sqlOutput = '';
  let totalBlocks = 0;
  let converted = 0;
  let skipped = 0;
  let errors = 0;

  for (const lesson of lessons as Lesson[]) {
    const content = lesson.content?.trim();
    if (!content) {
      skipped++;
      continue;
    }

    console.log(`Converting: "${lesson.title}" (${lesson.id})`);

    try {
      const blocks = parseHtmlToBlocks(content);

      if (blocks.length === 0) {
        // If parsing yields no blocks, create a single HTML fallback block
        blocks.push({
          block_type: 'html',
          content: { code: content },
          order_index: 0,
        });
      }

      console.log(`  → ${blocks.length} block(s): ${blocks.map(b => b.block_type).join(', ')}`);
      totalBlocks += blocks.length;

      if (opts.dryRun) {
        // Just display the blocks
        for (const block of blocks) {
          const preview = JSON.stringify(block.content).slice(0, 120);
          console.log(`    [${block.order_index}] ${block.block_type}: ${preview}...`);
        }
        converted++;
        continue;
      }

      if (opts.sqlOutput) {
        sqlOutput += blocksToSQL(lesson.id, blocks) + '\n';
        converted++;
        continue;
      }

      // Live DB write: delete existing blocks, insert new ones, mark migrated
      const { error: delError } = await supabase
        .from('lesson_blocks')
        .delete()
        .eq('lesson_id', lesson.id);

      if (delError) {
        console.error(`  ERROR deleting old blocks: ${delError.message}`);
        errors++;
        continue;
      }

      const rows = blocks.map((b) => ({
        lesson_id: lesson.id,
        block_type: b.block_type,
        content: b.content,
        order_index: b.order_index,
      }));

      const { error: insertError } = await supabase
        .from('lesson_blocks')
        .insert(rows);

      if (insertError) {
        console.error(`  ERROR inserting blocks: ${insertError.message}`);
        errors++;
        continue;
      }

      // Mark as migrated
      const { error: updateError } = await supabase
        .from('learning_lessons')
        .update({ content_migrated: true })
        .eq('id', lesson.id);

      if (updateError) {
        console.error(`  WARNING: blocks inserted but failed to mark migrated: ${updateError.message}`);
      }

      converted++;
    } catch (err) {
      console.error(`  ERROR converting: ${err}`);
      errors++;
    }
  }

  // Write SQL output if requested
  if (opts.sqlOutput && sqlOutput) {
    const outPath = path.resolve(process.cwd(), 'scripts/converted-blocks.sql');
    fs.writeFileSync(outPath, sqlOutput, 'utf-8');
    console.log(`\nSQL output written to: ${outPath}`);
  }

  // Summary
  console.log('\n=== Conversion Summary ===');
  console.log(`Total lessons processed: ${lessons.length}`);
  console.log(`Successfully converted:  ${converted}`);
  console.log(`Skipped (empty):         ${skipped}`);
  console.log(`Errors:                  ${errors}`);
  console.log(`Total blocks created:    ${totalBlocks}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
