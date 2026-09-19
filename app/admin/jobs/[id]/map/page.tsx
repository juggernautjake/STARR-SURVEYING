// app/admin/jobs/[id]/map/page.tsx — the old address of the property map.
//
// Owner, 2026-09-18: "For the one interactive map that we had already built out that doesn't use
// geocoder or the map, you can get rid of it and build the new system."
//
// What used to live here was an uploaded aerial with points stored as fractions of that image. It
// was replaced on 2026-09-19 by /admin/map, which draws the same points — the same titles, notes,
// types, layers and attached files — on Google satellite imagery at real coordinates.
//
// This file remains as a redirect rather than being deleted outright, because this URL is in
// browser histories, in pinned tabs, and quite possibly in an email to a client. A 404 would look
// like the feature was removed rather than moved.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function LegacyJobMapPage({ params }: { params: { id: string } }) {
  redirect(`/admin/map?job=${encodeURIComponent(params.id)}`);
}
