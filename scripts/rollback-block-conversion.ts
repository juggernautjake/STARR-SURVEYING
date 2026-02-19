/**
 * rollback-block-conversion.ts
 *
 * Rollback script: removes converted lesson_blocks and resets content_migrated flag.
 * The original HTML in learning_lessons.content is always preserved as fallback.
 *
 * Usage:
 *   npx tsx scripts/rollback-block-conversion.ts [options]
 *
 * Options:
 *   --dry-run       Show what would be rolled back without making changes
 *   --lesson-id=ID  Rollback a single lesson by UUID
 *   --module-id=ID  Rollback all lessons in a module by UUID
 *   --all           Rollback ALL migrated lessons (requires confirmation)
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as readline from 'readline';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, lessonId: '', moduleId: '', all: false };
  for (const arg of args) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--all') opts.all = true;
    else if (arg.startsWith('--lesson-id=')) opts.lessonId = arg.split('=')[1];
    else if (arg.startsWith('--module-id=')) opts.moduleId = arg.split('=')[1];
  }
  return opts;
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function main() {
  const opts = parseArgs();

  console.log('=== Block Conversion Rollback ===');
  console.log(`Mode: ${opts.dryRun ? 'DRY RUN' : 'LIVE ROLLBACK'}`);
  console.log('');

  // Find migrated lessons
  let query = supabase
    .from('learning_lessons')
    .select('id, title, module_id, content_migrated')
    .eq('content_migrated', true);

  if (opts.lessonId) query = query.eq('id', opts.lessonId);
  if (opts.moduleId) query = query.eq('module_id', opts.moduleId);

  const { data: lessons, error } = await query;
  if (error) {
    console.error('Error fetching lessons:', error);
    process.exit(1);
  }

  if (!lessons || lessons.length === 0) {
    console.log('No migrated lessons found to roll back.');
    return;
  }

  console.log(`Found ${lessons.length} migrated lesson(s):`);
  for (const l of lessons) {
    console.log(`  - ${l.title} (${l.id})`);
  }

  if (opts.dryRun) {
    console.log('\nDry run complete. No changes made.');
    return;
  }

  // Confirm for --all
  if (opts.all && lessons.length > 5) {
    const confirmed = await confirm(`\nThis will rollback ${lessons.length} lessons. Are you sure?`);
    if (!confirmed) {
      console.log('Aborted.');
      return;
    }
  }

  let rolled = 0;
  let errors = 0;

  for (const lesson of lessons) {
    console.log(`\nRolling back: "${lesson.title}" (${lesson.id})`);

    // Count blocks being removed
    const { count } = await supabase
      .from('lesson_blocks')
      .select('*', { count: 'exact', head: true })
      .eq('lesson_id', lesson.id);

    console.log(`  Removing ${count || 0} block(s)...`);

    // Delete blocks
    const { error: delError } = await supabase
      .from('lesson_blocks')
      .delete()
      .eq('lesson_id', lesson.id);

    if (delError) {
      console.error(`  ERROR deleting blocks: ${delError.message}`);
      errors++;
      continue;
    }

    // Reset migrated flag
    const { error: updateError } = await supabase
      .from('learning_lessons')
      .update({ content_migrated: false })
      .eq('id', lesson.id);

    if (updateError) {
      console.error(`  WARNING: blocks deleted but failed to reset flag: ${updateError.message}`);
    }

    rolled++;
    console.log(`  Done. Original HTML content is preserved in learning_lessons.content.`);
  }

  console.log('\n=== Rollback Summary ===');
  console.log(`Rolled back: ${rolled}`);
  console.log(`Errors:      ${errors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
