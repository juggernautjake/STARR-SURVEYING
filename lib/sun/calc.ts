// lib/sun/calc.ts
//
// hub-widget-excellence-15 — sun-calculator. Pure sunrise/sunset/daylight
// computation. Sun times are deterministic from latitude + longitude +
// date, so — unlike weather — this needs NO external API and never goes
// "unavailable". Returns UTC instants; the widget formats them in the
// surveyor's chosen zone.
//
// The math follows the well-proven SunCalc formulation (Vladimir Agafonkin,
// based on the Astronomy Answers position algorithms). Dependency-free →
// unit-tested in node against an Open-Meteo reference.

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397; // obliquity of the ecliptic
const J0 = 0.0009;

export interface SunTimes {
  /** UTC instant of sunrise, or null on a polar night (sun never rises). */
  sunrise: Date | null;
  /** UTC instant of sunset, or null on a polar day (sun never sets). */
  sunset: Date | null;
  /** UTC instant of solar noon (always defined). */
  solarNoon: Date;
  /** Hours of daylight (0 on polar night, 24 on polar day). */
  daylightHours: number;
}

const toJulian = (date: Date): number => date.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number): Date => new Date((j + 0.5 - J1970) * DAY_MS);
const toDays = (date: Date): number => toJulian(date) - J2000;

const solarMeanAnomaly = (d: number): number => RAD * (357.5291 + 0.98560028 * d);

function eclipticLongitude(M: number): number {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372; // perihelion of the Earth
  return M + C + P + Math.PI;
}

const declination = (l: number): number => Math.asin(Math.sin(OBLIQUITY) * Math.sin(l));

const julianCycle = (d: number, lw: number): number => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (Ht: number, lw: number, n: number): number => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, M: number, L: number): number =>
  J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

/** Hour angle for a given altitude `h`; NaN when the sun never reaches it
 *  (polar day/night), which the caller detects. */
const hourAngle = (h: number, phi: number, dec: number): number =>
  Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));

/**
 * Compute sunrise/sunset/solar-noon (UTC) + daylight hours for a point
 * and date. `elevationDeg` is the sun's centre altitude at the event:
 * the default −0.833° accounts for refraction + the solar disc (true
 * sunrise/sunset); pass −6 for civil twilight, etc.
 */
export function computeSunTimes(
  latitude: number,
  longitude: number,
  date: Date,
  elevationDeg = -0.833,
): SunTimes {
  const lw = RAD * -longitude;
  const phi = RAD * latitude;
  const d = toDays(date);

  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L);

  const Jnoon = solarTransitJ(ds, M, L);
  const solarNoon = fromJulian(Jnoon);

  const h = elevationDeg * RAD;
  const w = hourAngle(h, phi, dec);

  if (Number.isNaN(w)) {
    // The sun never reaches the threshold altitude → polar day or night.
    // Decide which by the sun's altitude at solar noon.
    const noonAltitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec));
    const polarDay = noonAltitude > h;
    return { sunrise: null, sunset: null, solarNoon, daylightHours: polarDay ? 24 : 0 };
  }

  const a = approxTransit(w, lw, n);
  const Jset = solarTransitJ(a, M, L);
  const Jrise = Jnoon - (Jset - Jnoon);

  const sunrise = fromJulian(Jrise);
  const sunset = fromJulian(Jset);

  return {
    sunrise,
    sunset,
    solarNoon,
    daylightHours: (sunset.getTime() - sunrise.getTime()) / 3600000,
  };
}
