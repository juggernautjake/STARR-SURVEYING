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
