// lib/hub/widgets/register-all.ts
//
// Side-effect barrel that registers every shipped widget with the
// widget-registry. The hub canvas imports this once so the renderer
// can resolve every saved widget type via `getWidget(id)`.
//
// New widgets are added to this file as their slice lands. The order
// here is the order they appear in the Add-Widget modal's "All"
// section (each widget defines its own category for the filtered
// views).
//
// Slice 94 of customizable-hub-and-work-mode-2026-05-28.md — first
// entry: Pinned Pages.

import './pinned-pages';
import './quick-actions';
import './my-pay';
import './my-jobs';
import './messages';
import './class-assignments';
import './today-schedule';
import './pto-balance';
import './hours-this-week';
import './recent-activity';
import './bookmarks';
import './open-discussions';
import './recent-announcements';
import './team-status';
import './mentions-inbox';
import './assignments-due';
import './crew-calendar';
import './field-data-pending';
import './job-activity-feed';
import './equipment-out';
import './maintenance-due';
import './low-consumables';
import './vehicles-status';
import './recent-drawings';
import './drawings-in-progress';
import './active-research-projects';
import './pipeline-status';
import './roadmap-progress';
import './flashcards-due';
import './quiz-history';
import './recommended-lessons';
import './pending-receipts';
import './pending-time-off';
import './pending-hours';
import './monthly-revenue';
import './outstanding-invoices';
