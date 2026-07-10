// lib/learn/fsGlossary.ts
//
// Curated glossary of Fundamentals of Surveying (FS) / SIT terms with concise,
// accurate definitions. Used to give instant tooltip definitions when a student
// clicks a highlighted term in a lesson; anything not here falls back to the AI
// define route. Keys are lowercased; `aliases` map alternate spellings/plurals.

export interface GlossaryEntry { term: string; definition: string }

// Canonical entries. Keep definitions to 1–3 sentences and technically correct.
const ENTRIES: GlossaryEntry[] = [
  { term: 'accuracy', definition: 'How close a measurement is to the true value. Distinct from precision, which is about repeatability.' },
  { term: 'precision', definition: 'How closely repeated measurements agree with one another (repeatability), regardless of whether they are close to the true value.' },
  { term: 'systematic error', definition: 'An error that follows a physical law and repeats with the same sign/pattern (e.g., a mis-calibrated tape). It can be modeled and removed.' },
  { term: 'random error', definition: 'Small, unavoidable error that varies unpredictably in sign and size; it follows the normal distribution and is reduced by averaging.' },
  { term: 'blunder', definition: 'A mistake (a gross error) such as a transposed digit or reading the wrong target — not a true "error"; it must be found and removed.' },
  { term: 'standard deviation', definition: 'A measure of the spread of a set of measurements about their mean; ~68% of a normal distribution lies within ±1 standard deviation.' },
  { term: 'traverse', definition: 'A series of connected lines whose lengths and directions are measured, used to establish horizontal control. A closed traverse returns to a known point.' },
  { term: 'latitude', definition: 'In traverse computations, the north–south component of a line: latitude = length × cos(azimuth). North is positive.' },
  { term: 'departure', definition: 'In traverse computations, the east–west component of a line: departure = length × sin(azimuth). East is positive.' },
  { term: 'misclosure', definition: 'The small amount by which a survey fails to close perfectly. Linear misclosure = √(ΣLat² + ΣDep²); it is distributed by an adjustment.' },
  { term: 'closure', definition: 'How well a traverse or level circuit returns to its starting value. Often expressed as a relative precision such as 1:10,000.' },
  { term: 'relative precision', definition: 'The ratio of linear misclosure to total traverse length, reduced to 1:N (e.g., 0.10 ft in 5,000 ft = 1:50,000).' },
  { term: 'compass rule', definition: 'The Bowditch (compass) rule adjusts a traverse by distributing misclosure in proportion to each leg length. Assumes angles and distances are equally reliable.' },
  { term: 'transit rule', definition: 'A traverse adjustment that distributes misclosure in proportion to the latitude/departure of each leg; used when angles are more reliable than distances.' },
  { term: 'least squares', definition: 'A rigorous adjustment that finds the most probable values by minimizing the sum of the squares of the weighted residuals. The modern standard method.' },
  { term: 'azimuth', definition: 'A horizontal direction measured clockwise from a reference meridian (usually north), ranging 0°–360°.' },
  { term: 'bearing', definition: 'A horizontal direction given as an acute angle (0°–90°) from north or south, toward east or west (e.g., N45°E).' },
  { term: 'backsight', definition: 'A reading taken back to a point of known position or elevation to orient the instrument or carry elevation forward.' },
  { term: 'foresight', definition: 'A reading taken forward to a new point whose position or elevation is being determined.' },
  { term: 'turning point', definition: 'A temporary point on which both a foresight and the following backsight are taken to carry elevation forward in a level circuit.' },
  { term: 'benchmark', definition: 'A permanent, monumented point of known elevation used as a reference (a "BM") for leveling.' },
  { term: 'differential leveling', definition: 'Determining the elevation difference between points using a level and rod: HI = known elevation + backsight; new elevation = HI − foresight.' },
  { term: 'trigonometric leveling', definition: 'Finding elevation differences from a measured slope distance (or horizontal distance) and vertical angle using trigonometry.' },
  { term: 'height of instrument', definition: 'In leveling, the elevation of the line of sight: HI = benchmark elevation + backsight. (In some contexts, the instrument height above its point.)' },
  { term: 'edm', definition: 'Electronic Distance Measurement — measuring distance by timing modulated light/microwave energy to a reflector and back. The core of a total station.' },
  { term: 'total station', definition: 'An instrument combining an electronic theodolite (angles) with EDM (distance) and an onboard computer to measure and record coordinates.' },
  { term: 'gnss', definition: 'Global Navigation Satellite System — the general term for satellite positioning (GPS, GLONASS, Galileo, BeiDou).' },
  { term: 'gps', definition: 'The U.S. Global Positioning System, one GNSS constellation. Positions are computed from ranges to multiple satellites.' },
  { term: 'rtk', definition: 'Real-Time Kinematic GNSS — carrier-phase positioning with a base and rover (or network) giving centimeter accuracy in real time.' },
  { term: 'static survey', definition: 'A GNSS method where receivers occupy points for an extended period; post-processed for high-accuracy control over longer baselines.' },
  { term: 'datum', definition: 'A reference system for coordinates or elevations (e.g., NAD83 for horizontal, NAVD88 for vertical) defined by a model of the Earth.' },
  { term: 'ellipsoid', definition: 'A smooth mathematical model of the Earth’s shape used as the reference for horizontal datums (e.g., GRS80). Ellipsoidal heights are measured from it.' },
  { term: 'geoid', definition: 'The equipotential gravity surface approximating mean sea level. Orthometric (leveled) elevations are referenced to the geoid.' },
  { term: 'geoid height', definition: 'The separation (N) between the geoid and the ellipsoid at a point: H = h − N (orthometric = ellipsoidal − geoid height).' },
  { term: 'orthometric height', definition: 'Elevation above the geoid (mean-sea-level-based height, H) — what leveling measures. Related to ellipsoidal height by H = h − N.' },
  { term: 'ellipsoidal height', definition: 'Height (h) above the reference ellipsoid, as delivered by GNSS. Convert to orthometric height with a geoid model: H = h − N.' },
  { term: 'nad83', definition: 'North American Datum of 1983 — the standard horizontal geodetic datum for the U.S., based on the GRS80 ellipsoid.' },
  { term: 'navd88', definition: 'North American Vertical Datum of 1988 — the standard orthometric height datum for the U.S.' },
  { term: 'state plane coordinates', definition: 'A plane rectangular coordinate system (SPCS) that maps a state’s zones onto Lambert or Transverse Mercator projections for local, low-distortion work.' },
  { term: 'utm', definition: 'Universal Transverse Mercator — a worldwide projected coordinate system dividing the Earth into 6°-wide zones.' },
  { term: 'scale factor', definition: 'The ratio that converts a ground distance to a grid distance on a map projection (varies with position within the zone).' },
  { term: 'elevation factor', definition: 'The factor that reduces a ground distance to the ellipsoid: R / (R + h). Multiplied by the scale factor to get the combined factor.' },
  { term: 'combined factor', definition: 'Scale factor × elevation factor — the single multiplier converting a ground distance to a grid distance (grid = ground × combined factor).' },
  { term: 'convergence', definition: 'The angle between grid north and true (geodetic) north at a point on a projection; also called mapping angle.' },
  { term: 'metes and bounds', definition: 'A boundary description by courses (bearings/azimuths) and distances ("metes") referencing natural or artificial monuments ("bounds"), common in Texas.' },
  { term: 'vara', definition: 'A traditional Spanish unit of length used in Texas surveys; the Texas vara is defined as 33 1/3 inches (about 2.7778 ft).' },
  { term: 'point of beginning', definition: 'The POB — the fixed starting corner of a metes-and-bounds description; the description must close back to it.' },
  { term: 'monument', definition: 'A physical object (iron rod, pipe, stone, etc.) marking a survey point or property corner. Called for monuments generally control over measurements.' },
  { term: 'easement', definition: 'A right to use another’s land for a specific purpose (e.g., utilities, access) without owning it.' },
  { term: 'encroachment', definition: 'An improvement (fence, building, etc.) that intrudes across a boundary onto adjoining property or an easement.' },
  { term: 'adverse possession', definition: 'A legal doctrine by which continuous, open, hostile use of land for a statutory period can ripen into title.' },
  { term: 'riparian rights', definition: 'Water rights of land bordering a flowing watercourse (river/stream).' },
  { term: 'littoral rights', definition: 'Water rights of land bordering a static body of water such as a lake, sea, or ocean.' },
  { term: 'plat', definition: 'A recorded map of a subdivision showing lots, blocks, streets, easements, and monuments.' },
  { term: 'contour', definition: 'A line on a map joining points of equal elevation. The contour interval is the vertical distance between successive contours.' },
  { term: 'photogrammetry', definition: 'Making measurements (positions, elevations, maps) from photographs, typically overlapping aerial imagery viewed stereoscopically.' },
  { term: 'lidar', definition: 'Light Detection and Ranging — an active sensor that measures distance with laser pulses to produce dense 3D point clouds.' },
  { term: 'stadia', definition: 'A tacheometric method using the interval between rod cross-hairs to compute distance (≈100 × the rod intercept) and elevation.' },
  { term: 'horizontal curve', definition: 'A circular arc joining two straight tangents in the horizontal plane. Key elements: radius R, degree of curve D, tangent T, length L, and central angle Δ.' },
  { term: 'vertical curve', definition: 'A parabolic curve joining two grades in profile (a crest or sag) to provide a smooth transition; laid out by station and elevation.' },
  { term: 'degree of curve', definition: 'A measure of a horizontal curve’s sharpness: the central angle subtended by a 100-ft arc (arc definition) or chord (chord definition).' },
  { term: 'deflection angle', definition: 'The angle at a point between the extension of the previous line and the next line; used to lay out traverses and curves.' },
  { term: 'average end area', definition: 'An earthwork volume method: V = (A1 + A2)/2 × L, averaging the two end cross-section areas over the distance between them.' },
  { term: 'prismoidal', definition: 'A more exact earthwork volume formula using end areas plus the middle area: V = L/6 × (A1 + 4Am + A2).' },
  { term: 'cut', definition: 'Earthwork where existing ground is above the proposed grade and material must be excavated (removed).' },
  { term: 'fill', definition: 'Earthwork where the proposed grade is above existing ground and material must be added (embankment).' },
  { term: 'residual', definition: 'In an adjustment, the difference between an adjusted (most-probable) value and the corresponding observation.' },
  { term: 'meridian', definition: 'A north–south reference line. Directions (azimuths/bearings) are measured from a meridian (true, grid, magnetic, or assumed).' },
  // Business, ethics & professional practice (NCEES Category 6)
  { term: 'sole proprietorship', definition: 'The simplest, most common business form: one owner who is legally the same as the business and has unlimited personal liability.' },
  { term: 'partnership', definition: 'A business owned by two or more people working for a profit. In a general partnership the partners have unlimited, joint-and-several liability.' },
  { term: 'corporation', definition: 'A legal entity that exists independently of its owners (shareholders); it can issue stock, and owner liability is generally limited to their investment.' },
  { term: 'llc', definition: 'Limited Liability Company — a flexible entity that limits owners’ (members’) liability to their investment. A PLLC is the professional form for licensed practice.' },
  { term: 'consideration', definition: 'The value each party exchanges in a contract (money, goods, services, or a promise) and bargains for. One of the required elements of a valid contract.' },
  { term: 'standard of care', definition: 'The degree of skill and diligence a reasonably prudent surveyor would exercise under similar conditions. Falling below it and causing damage is negligence.' },
  { term: 'negligence', definition: 'Failure to meet the standard of care, resulting in harm. A surveyor is liable for negligence — not for failing to achieve perfection.' },
  { term: 'model rules', definition: 'The NCEES Model Rules of Professional Conduct, the template most state boards adopt; they make protecting the public’s health, safety and welfare a licensee’s first duty.' },
  { term: 'conflict of interest', definition: 'A situation where a professional’s obligations could be compromised. The Model Rules require avoiding conflicts and, if unavoidable, disclosing them fully to all affected parties.' },
  { term: 'confined space', definition: 'A space large enough to enter and work, with limited/restricted means of entry-exit, that is not designed for continuous occupancy (e.g., a manhole or vault).' },
  { term: 'permit-required confined space', definition: 'A confined space that also contains, or could contain, a hazardous atmosphere, engulfment risk, entrapment configuration, or other recognized serious hazard.' },
  { term: 'simple interest', definition: 'Interest charged only on the original principal (or on the remaining balance): I = P·i·n. It does not compound.' },
  { term: 'compound interest', definition: 'Interest earned on both principal and previously accumulated interest: future worth F = P(1 + i)^n.' },
  { term: 'present worth', definition: 'The value today of a future amount, discounted at the interest rate: P = F / (1 + i)^n.' },
  { term: 'depreciation', definition: 'The systematic loss of an asset’s value over its useful life. Straight-line: D = (cost − salvage) / life, the same amount each year.' },
  { term: 'nfip', definition: 'The National Flood Insurance Program (FEMA). The FEMA Elevation Certificate provides the elevation data used to rate structures for flood insurance.' },
  { term: 'one-call', definition: 'The 811 utility-locate service. Surveyors and contractors must notify One-Call before digging so existing underground utilities are marked, preventing strikes.' },
];

// Common aliases / plurals → canonical key.
const ALIASES: Record<string, string> = {
  'bowditch rule': 'compass rule',
  'pob': 'point of beginning',
  'hi': 'height of instrument',
  'bm': 'benchmark',
  'gnss/gps': 'gnss',
  'std dev': 'standard deviation',
  'riparian': 'riparian rights',
  'littoral': 'littoral rights',
  'spcs': 'state plane coordinates',
  'end area': 'average end area',
  'grid factor': 'combined factor',
};

const MAP = new Map<string, GlossaryEntry>();
for (const e of ENTRIES) MAP.set(e.term.toLowerCase(), e);

function normalize(raw: string): string {
  return raw.toLowerCase().replace(/[.,;:!?()"'`]/g, '').replace(/\s+/g, ' ').trim();
}

/** Look up a term (alias- and plural-aware). Returns null when not in the glossary. */
export function lookupTerm(raw: string): GlossaryEntry | null {
  const n = normalize(raw);
  if (!n) return null;
  if (MAP.has(n)) return MAP.get(n)!;
  if (ALIASES[n]) return MAP.get(ALIASES[n]) ?? null;
  // simple plural → singular
  if (n.endsWith('s') && MAP.has(n.slice(0, -1))) return MAP.get(n.slice(0, -1))!;
  if (n.endsWith('es') && MAP.has(n.slice(0, -2))) return MAP.get(n.slice(0, -2))!;
  return null;
}
