// scripts/nav-consolidation-count.mjs — how many sidebar links the consolidation plan removes.
//
//   node scripts/nav-consolidation-count.mjs
//
// docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md claims "138 nav links become 29". That
// is the kind of number that is quoted for a year after the one person who counted it has forgotten
// how. This is the count, run against the live registry, so the claim can be re-checked after every
// slice and goes stale loudly instead of quietly.
//
// The FIRST draft of that plan said 24, guessed rather than counted. It was wrong by nine.
import fs from 'node:fs';
const src = fs.readFileSync('lib/admin/route-registry.ts', 'utf8');
const re = /\{\s*href:\s*'([^']+)',\s*label:\s*'([^']+)',\s*workspace:\s*'([^']+)'/g;
const nav = [];
let m;
while ((m = re.exec(src))) nav.push({ href: m[1], label: m[2], ws: m[3] });

// Everything §4 says is absorbed, keyed by the portal it goes into.
const ABSORB = {
  '/admin/pay': ['/admin/payroll', '/admin/payouts', '/admin/payouts/runs', '/admin/payouts/ad-hoc', '/admin/payouts/search', '/admin/payouts/withdrawals', '/admin/payout-log', '/admin/pay-rates', '/admin/pay-progression', '/admin/my-pay', '/admin/rewards', '/admin/rewards/admin', '/admin/rewards/how-it-works'],
  '/admin/receipts': ['/admin/receipts/new', '/admin/cards', '/admin/pass-through', '/admin/mileage'],
  '/admin/hours': ['/admin/hours-approval', '/admin/my-hours', '/admin/time-off', '/admin/availability', '/admin/personnel/crew-calendar'],
  '/admin/jobs': ['/admin/projects', '/admin/projects/new', '/admin/jobs/new', '/admin/jobs/import', '/admin/calendar', '/admin/timeline', '/admin/field-data'],
  '/admin/equipment': ['/admin/equipment/today', '/admin/equipment/checked-out', '/admin/equipment/timeline', '/admin/equipment/maintenance', '/admin/equipment/consumables', '/admin/equipment/templates', '/admin/equipment/templates/cleanup-queue', '/admin/equipment/templates/new', '/admin/equipment/overrides', '/admin/equipment/fleet-valuation', '/admin/equipment/inventory', '/admin/equipment/import', '/admin/vehicles'],
  '/admin/marketing': ['/admin/leads'],
  '/admin/finances': ['/admin/finances/overview', '/admin/finances/reconcile', '/admin/payouts/tax-report'],
  '/admin/invoicing': ['/admin/invoices/new', '/admin/invoicing/categories', '/admin/receivables', '/admin/payments/inbox'],
  '/admin/billing': ['/admin/billing/invoices', '/admin/billing/plan-history', '/admin/billing/upgrade'],
  '/admin/people': ['/admin/employees', '/admin/employees/manage', '/admin/users', '/admin/invites', '/admin/roles/custom', '/admin/role-requests'],
  '/admin/messages': ['/admin/messages/contacts', '/admin/messages/new', '/admin/messages/settings', '/admin/email/new', '/admin/email/sent'],
  '/admin/learn': ['/admin/learn/roadmap', '/admin/learn/modules', '/admin/learn/knowledge-base', '/admin/learn/flashcards', '/admin/learn/flashcard-bank', '/admin/learn/quiz-history', '/admin/learn/search', '/admin/learn/references', '/admin/learn/practice', '/admin/learn/flashcards/create', '/admin/learn/students', '/admin/learn/fieldbook', '/admin/my-notes'],
  '/admin/research': ['/admin/research/coverage', '/admin/research/library', '/admin/research/pipeline', '/admin/research/sites', '/admin/research/self-heal', '/admin/research/billing'],
  '/admin/settings': ['/admin/org-settings', '/admin/orgs', '/admin/announcements', '/admin/notifications', '/admin/me/privacy'],
  '/admin/support': ['/admin/support/new', '/admin/error-log', '/admin/audit'],
};


ABSORB["/admin/design"] = ["/admin/design/compare","/admin/design/dossiers","/admin/design/versions","/admin/design/conformance","/admin/design/serve"];
ABSORB["/admin/files"] = ["/admin/my-files"];
ABSORB["/admin/learn/exam-prep"] = ["/admin/learn/exam-prep/sit","/admin/learn/exam-prep/sit/mock-exam","/admin/learn/exam-prep/rpls"];
ABSORB["/admin/learn/manage"] = ["/admin/learn/manage/media","/admin/learn/manage/question-builder"];
ABSORB["/admin/messages"].push("/admin/contacts","/admin/discussions");
ABSORB["/admin/settings"].push("/admin/notes");
ABSORB["/admin/hours"].push("/admin/team","/admin/assignments","/admin/schedule");
ABSORB["/admin/jobs"].push("/admin/weather","/admin/compliance");
ABSORB["/admin/finances"].push("/admin/reports");

const absorbed = new Set(Object.values(ABSORB).flat());
const portals = new Set(Object.keys(ABSORB));
const survivors = nav.filter((r) => !absorbed.has(r.href));

console.log(`nav entries now:            ${nav.length}`);
console.log(`absorbed into a portal:     ${absorbed.size}`);
console.log(`nav entries after:          ${survivors.length}`);
console.log(`  …of which are portals:    ${survivors.filter((r) => portals.has(r.href)).length}`);
console.log(`\nEVERY SURVIVING LINK (${survivors.length}):`);
for (const r of survivors) {
  console.log(`  ${portals.has(r.href) ? 'PORTAL ' : '       '}${r.href.padEnd(34)} ${r.label}`);
}

console.log();const missing = [...absorbed].filter((h) => !nav.some((r) => r.href === h));
if (missing.length) console.log(`\n⚠ absorbed but not in the registry (check these): ${missing.join(', ')}`);
