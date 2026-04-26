/**
 * Random UUID v4 generator backed by expo-crypto.
 *
 * Why not crypto.randomUUID(): React Native's bundled WebCrypto polyfill
 * (via react-native-get-random-values) provides getRandomValues but
 * not always randomUUID across SDK versions. expo-crypto gives a
 * stable randomUUID across iOS / Android / web with a single import.
 *
 * Used by lib/timeTracking.ts (and any future row-creating code) to
 * mint primary keys client-side. PowerSync's CRUD queue identifies
 * rows by these uuids, so they MUST be unique across all clients —
 * v4 entropy is sufficient for that (collision probability is
 * effectively zero at our row volumes).
 */
import { randomUUID as expoRandomUUID } from 'expo-crypto';

export function randomUUID(): string {
  return expoRandomUUID();
}
