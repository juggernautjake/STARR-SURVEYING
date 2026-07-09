// lib/learn/tutor-suggestions.ts — clickable "what you could ask" example questions for
// the FS tutor. Prefers the current module's real key topics (grounded, relevant), and
// falls back to core surveying starters. Shown on the empty chat and whenever the tutor
// refuses an off-topic question, so the student always has an in-scope way forward.
import { supabaseAdmin } from '@/lib/supabase';

const GENERIC: string[] = [
  "What's the difference between accuracy and precision?",
  'How do I convert a bearing to an azimuth?',
  'Walk me through adjusting a closed traverse.',
  'Explain the US survey foot vs. the international foot.',
  'How does error propagate through a set of measurements?',
];

function fromTopics(topics: string[]): string[] {
  const templates = [
    (t: string) => `Can you explain ${t}?`,
    (t: string) => `Walk me through a worked example of ${t}.`,
    (t: string) => `What do I need to know about ${t} for the FS exam?`,
    (t: string) => `Why does ${t} matter in surveying?`,
  ];
  return topics.slice(0, 4).map((t, i) => templates[i % templates.length](t.trim().replace(/\.$/, '')));
}

export async function moduleSuggestions(opts: { moduleId?: string; moduleNumber?: number }): Promise<string[]> {
  try {
    let q = supabaseAdmin.from('fs_study_modules').select('key_topics, module_number').limit(1);
    if (opts.moduleId) q = supabaseAdmin.from('fs_study_modules').select('key_topics, module_number').eq('id', opts.moduleId).limit(1);
    else if (typeof opts.moduleNumber === 'number') q = supabaseAdmin.from('fs_study_modules').select('key_topics, module_number').eq('module_number', opts.moduleNumber).limit(1);
    const { data } = await q;
    const row = ((data ?? []) as { key_topics: string[] | null }[])[0];
    const topics = (row?.key_topics ?? []).filter((t) => typeof t === 'string' && t.trim());
    if (topics.length >= 2) return fromTopics(topics);
  } catch {
    /* fall through to generic starters */
  }
  return GENERIC.slice(0, 4);
}
