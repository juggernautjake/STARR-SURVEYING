/**
 * Vehicles — read-only on mobile.
 *
 * The fleet roster is maintained by the office at /admin/vehicles
 * (seeds/225 + /api/admin/vehicles). Mobile reads via PowerSync
 * (sync rule scoped to active=true; RLS forbids INSERT / UPDATE /
 * DELETE per seeds/225). Used by:
 *
 *   - The clock-in flow's vehicle picker (F6 #vehicle-picker) —
 *     populates `job_time_entries.vehicle_id` for IRS mileage
 *     attribution.
 *   - The future per-vehicle stops/segments overlay on
 *     /admin/timeline.
 */
import { useEffect, useMemo } from 'react';
import { useQuery } from '@powersync/react';

import type { AppDatabase } from './db/schema';
import { logError } from './log';

export type Vehicle = AppDatabase['vehicles'];

/**
 * Reactive list of every active vehicle, alphabetically. Tiny table
 * (~10 vehicles for a Starr-sized fleet) so we don't paginate.
 */
export function useVehicles(): { vehicles: Vehicle[]; isLoading: boolean } {
  const { data, isLoading, error } = useQuery<Vehicle>(
    `SELECT * FROM vehicles
      WHERE COALESCE(active, 1) = 1
      ORDER BY COALESCE(name, '') ASC`
  );

  useEffect(() => {
    if (error) {
      logError('vehicles.useVehicles', 'query failed', error);
    }
  }, [error]);

  return { vehicles: data ?? [], isLoading };
}

/**
 * Single-vehicle fetch by id — used by the clocked-in card to
 * display the vehicle name without re-running the full list query.
 */
export function useVehicle(
  id: string | null | undefined
): { vehicle: Vehicle | null; isLoading: boolean } {
  const queryParams = useMemo(() => (id ? [id] : []), [id]);
  const { data, isLoading, error } = useQuery<Vehicle>(
    `SELECT * FROM vehicles WHERE id = ? LIMIT 1`,
    queryParams
  );
  useEffect(() => {
    if (error) {
      logError('vehicles.useVehicle', 'query failed', error, {
        vehicle_id: id ?? null,
      });
    }
  }, [error, id]);
  return {
    vehicle: data?.[0] ?? null,
    isLoading: !!id && isLoading,
  };
}
