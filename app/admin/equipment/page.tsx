// app/admin/equipment/page.tsx
//
// Equipment workspace landing. Mirrors the same pattern as work,
// office, research-cad, and knowledge — renders WorkspaceLanding,
// which lists every accessible route in the `equipment` workspace as
// a card.
//
// Without this file, `/admin/equipment` 404s; the IconRail link
// (Mod+3) had nowhere to land.

import WorkspaceLanding from '../components/nav/WorkspaceLanding';

export default function EquipmentLanding() {
  return <WorkspaceLanding workspace="equipment" />;
}
