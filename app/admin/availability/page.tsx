// app/admin/availability/page.tsx — the answer §2.4 said took three pages.
//
// *"Ten time/schedule surfaces … A dispatcher deciding 'who and what is available Thursday' has to
// open three pages."*
//
// This is the eleventh route, which needs justifying. It is not a fourth calendar: the four that
// exist each answer "what is happening over a period" for one resource type, and none of them
// answers "for THIS day, what can I send". That question spans crew, equipment and vehicles, and
// spanning is the one thing a per-resource calendar cannot do without becoming a different page.
//
// Nothing is moved or deleted. My Schedule, Calendar, Crew Calendar and Equipment Timeline all keep
// doing what they do — the audit's own People fix established the pattern: add the missing front
// door, do not demolish the surfaces that are authoritative for their own subject.

import AvailabilityClient from './AvailabilityClient';
import './Availability.css';

export const metadata = { title: 'Availability' };

export default function AvailabilityPage() {
  return <AvailabilityClient />;
}
