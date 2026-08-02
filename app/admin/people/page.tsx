// app/admin/people/page.tsx — the one people directory (platform audit §2.3 / Phase 1 item 7).
//
// §2.3: ten routes describing one noun. This is the front door to all of them.
import PeopleDirectory from './PeopleDirectory';
import './People.css';

export const metadata = { title: 'People' };

export default function PeoplePage() {
  return <PeopleDirectory />;
}
