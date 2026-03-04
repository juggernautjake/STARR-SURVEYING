// lib/cad/geometry/bearing.ts — DMS, quadrant bearings, azimuth conversions
import type { Point2D } from '../types';

export interface QuadrantBearing {
  direction1: 'N' | 'S';
  degrees: number;
  minutes: number;
  seconds: number;
  tenthSeconds: number;                // 0-9 (for precision surveys)
  direction2: 'E' | 'W';
}

export function azimuthToQuadrant(azimuth: number): QuadrantBearing {
  const az = ((azimuth % 360) + 360) % 360; // Normalize to 0-360
  let d1: 'N' | 'S', d2: 'E' | 'W', angle: number;

  if (az >= 0 && az < 90)         { d1 = 'N'; d2 = 'E'; angle = az; }
  else if (az >= 90 && az < 180)  { d1 = 'S'; d2 = 'E'; angle = 180 - az; }
  else if (az >= 180 && az < 270) { d1 = 'S'; d2 = 'W'; angle = az - 180; }
  else                             { d1 = 'N'; d2 = 'W'; angle = 360 - az; }

  return { ...decimalToDMS(angle), direction1: d1, direction2: d2 };
}

export function quadrantToAzimuth(qb: QuadrantBearing): number {
  const decimal = dmsToDecimal(qb.degrees, qb.minutes, qb.seconds + qb.tenthSeconds / 10);
  if (qb.direction1 === 'N' && qb.direction2 === 'E') return decimal;
  if (qb.direction1 === 'S' && qb.direction2 === 'E') return 180 - decimal;
  if (qb.direction1 === 'S' && qb.direction2 === 'W') return 180 + decimal;
  return 360 - decimal; // N-W
}

export function decimalToDMS(decimal: number): { degrees: number; minutes: number; seconds: number; tenthSeconds: number } {
  const abs = Math.abs(decimal);
  const degrees = Math.floor(abs);
  const minRemainder = (abs - degrees) * 60;
  const minutes = Math.floor(minRemainder);
  const secRemainder = (minRemainder - minutes) * 60;
  const seconds = Math.floor(secRemainder);
  const tenthSeconds = Math.round((secRemainder - seconds) * 10);
  return { degrees, minutes, seconds, tenthSeconds };
}

export function dmsToDecimal(d: number, m: number, s: number): number {
  return d + m / 60 + s / 3600;
}

export function formatBearing(azimuth: number, precision: 'SECOND' | 'TENTH_SECOND' = 'SECOND'): string {
  const qb = azimuthToQuadrant(azimuth);
  const sec = precision === 'TENTH_SECOND'
    ? `${String(qb.seconds).padStart(2, '0')}.${qb.tenthSeconds}`
    : `${String(qb.seconds).padStart(2, '0')}`;
  return `${qb.direction1} ${qb.degrees}°${String(qb.minutes).padStart(2, '0')}'${sec}" ${qb.direction2}`;
}

export function formatAzimuth(azimuth: number): string {
  const dms = decimalToDMS(azimuth);
  return `${dms.degrees}°${String(dms.minutes).padStart(2, '0')}'${String(dms.seconds).padStart(2, '0')}"`;
}

export function formatDMS(degrees: number): string {
  const dms = decimalToDMS(Math.abs(degrees));
  return `${dms.degrees}°${String(dms.minutes).padStart(2, '0')}'${String(dms.seconds).padStart(2, '0')}"`;
}

/**
 * Parse bearing strings in various formats:
 *   "N 45°30'15\" E"    → standard quadrant
 *   "N45-30-15E"        → abbreviated
 *   "N 45 30 15 E"      → space-separated
 *   "45.5042"           → decimal degrees (azimuth)
 *   "135°30'15\""       → azimuth DMS
 */
export function parseBearing(input: string): number | null {
  const s = input.trim().toUpperCase();

  // Quadrant bearing: N dd°mm'ss" E
  const qbMatch = s.match(/^([NS])\s*(\d+)[°\-\s]+(\d+)['\-\s]+(\d+\.?\d*)["\s]*([EW])$/);
  if (qbMatch) {
    const qb: QuadrantBearing = {
      direction1: qbMatch[1] as 'N' | 'S',
      degrees: parseInt(qbMatch[2]),
      minutes: parseInt(qbMatch[3]),
      seconds: Math.floor(parseFloat(qbMatch[4])),
      tenthSeconds: Math.round((parseFloat(qbMatch[4]) % 1) * 10),
      direction2: qbMatch[5] as 'E' | 'W',
    };
    return quadrantToAzimuth(qb);
  }

  // Azimuth DMS: ddd°mm'ss"
  const azDmsMatch = s.match(/^(\d+)[°\-\s]+(\d+)['\-\s]+(\d+\.?\d*)"?$/);
  if (azDmsMatch) {
    return dmsToDecimal(parseInt(azDmsMatch[1]), parseInt(azDmsMatch[2]), parseFloat(azDmsMatch[3]));
  }

  // Decimal degrees
  const decimal = parseFloat(s);
  if (!isNaN(decimal) && decimal >= 0 && decimal < 360) return decimal;

  return null;
}

export function inverseBearingDistance(from: Point2D, to: Point2D): { azimuth: number; distance: number } {
  const dE = to.x - from.x;
  const dN = to.y - from.y;
  const distance = Math.sqrt(dE * dE + dN * dN);

  // Azimuth: 0=North, clockwise
  let azimuth = Math.atan2(dE, dN) * (180 / Math.PI);
  if (azimuth < 0) azimuth += 360;

  return { azimuth, distance };
}

export function forwardPoint(from: Point2D, azimuthDeg: number, distance: number): Point2D {
  const azRad = azimuthDeg * (Math.PI / 180);
  return {
    x: from.x + distance * Math.sin(azRad),  // Easting
    y: from.y + distance * Math.cos(azRad),   // Northing
  };
}
