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
  // Thin-topic terms (mapping, geodesy, boundary)
  { term: 'las', definition: 'The binary public interchange format for LiDAR point clouds (the LAS/LASer file format). Preferred over ASCII for size and speed.' },
  { term: 'nssda', definition: 'National Standard for Spatial Data Accuracy. Accuracy at 95% confidence = RMSE × 1.7308 (horizontal) or × 1.9600 (vertical).' },
  { term: 'elevation certificate', definition: 'A FEMA/NFIP form documenting a structure’s elevation relative to the base flood elevation; used to rate flood insurance and support map amendments.' },
  { term: 'lambert conformal conic', definition: 'A conic map projection used for State Plane zones that are wider east–west; meridians converge to a central point and parallels are concentric arcs.' },
  { term: 'transverse mercator', definition: 'A cylindrical map projection used for State Plane zones that are longer north–south (and for UTM); it minimizes distortion along a central meridian.' },
  { term: 'spherical trigonometry', definition: 'Trigonometry of triangles on a sphere. Law of cosines for sides: cos c = cos a cos b + sin a sin b cos C — used in geodetic/astronomic computations.' },
  { term: 'obliterated corner', definition: 'A PLSS corner with no remaining monument traces but whose position is recoverable from reliable testimony and acceptable evidence (contrast: lost corner).' },
  { term: 'lost corner', definition: 'A PLSS corner whose position cannot be recovered from evidence or testimony and must be re-established by proportionate measurement (single/double proportion).' },
  { term: 'relief displacement', definition: 'On a vertical aerial photo, the radial shift of a tall object’s image away from the principal point; it increases with object height and radial distance.' },
  { term: 'raster', definition: 'A GIS data model representing the world as a regular grid of cells (pixels), each holding a value — well suited to continuous surfaces and imagery.' },
  { term: 'vector', definition: 'A GIS data model representing discrete features as points, lines, and polygons defined by coordinates (as opposed to a raster grid).' },
  { term: 'topology', definition: 'In GIS, the geometric relationships among spatial features — connectivity, adjacency, and containment — independent of display attributes like color.' },

  // ── ADDED 2026-08-06 ──────────────────────────────────────────────────────────────────────────
  //
  // Owner: *"create static definitions for the terms for all of the words and terms that need
  // definitions. Go through the modules."*
  //
  // Extracted every `**bolded**` run from the FS lesson seeds — 1,551 distinct — because the module
  // page turns each one into a clickable term. Most are not terms: emphasis (`**not**`), formulas
  // (`**H = h − N**`), angle values (`**112°00′25″**`), symbols (`**x̄**`) and headings
  // (`**Solution.**`). Those are filtered out at the click handler now rather than defined here.
  // What follows is the surveying vocabulary that was left.

  // ── Measurement, statistics and error theory ──────────────────────────────────────────────────
  { term: 'most probable value', definition: 'The best estimate of a quantity from redundant measurements. For equally weighted observations it is the arithmetic mean.' },
  { term: 'degrees of freedom', definition: 'The number of redundant measurements — observations minus unknowns. With no redundancy there is no check on the work and no way to estimate precision.' },
  { term: 'standard error of the mean', definition: 'The standard deviation of the mean, equal to the standard deviation of a single measurement divided by √n. Halving it requires four times as many measurements.' },
  { term: 'sample standard deviation', definition: 'The spread of a sample about its mean, computed with n−1 in the denominator (the Sx or sx key on an exam calculator). Use it for survey data; the population form assumes you measured everything.' },
  { term: 'variance', definition: 'The square of the standard deviation. Variances add for independent quantities, which is why error propagation works in squares rather than directly.' },
  { term: 'error propagation', definition: 'Carrying the uncertainty of measured quantities through to a computed result. Independent errors combine in quadrature — as the square root of the sum of the squares.' },
  { term: 'combine in quadrature', definition: 'Adding independent errors as √(a² + b² + …) rather than arithmetically, because independent errors partly offset instead of accumulating.' },
  { term: 'normal distribution', definition: 'The bell-shaped Gaussian curve that random error follows. About 68% of observations fall within ±1σ, 95% within ±2σ, and 99.7% within ±3σ.' },
  { term: '68-95-99.7 rule', definition: 'The share of a normal distribution lying within one, two and three standard deviations of the mean. A quick sanity check on whether an outlier is plausible.' },
  { term: 'weight', definition: 'A number expressing an observation’s relative reliability. Weight is inversely proportional to variance, so a more precise measurement pulls harder on the result.' },
  { term: 'weighted mean', definition: 'A mean in which each observation is multiplied by its weight: Σ(w·x) ÷ Σw. Used when measurements are not equally reliable.' },
  { term: 'significant figures', definition: 'The digits in a number that carry real meaning. A computed result must not be reported to more precision than the least precise measurement that produced it.' },
  { term: 'confidence interval', definition: 'A range expected to contain the true value at a stated probability, such as the 95% interval spanning roughly ±2 standard deviations of the mean.' },

  // ── Leveling ──────────────────────────────────────────────────────────────────────────────────
  { term: 'profile leveling', definition: 'Leveling along a line — a road centreline or pipeline — to produce a ground profile of elevation against station.' },
  { term: 'reciprocal leveling', definition: 'Leveling a wide obstacle such as a river from both banks and averaging, which cancels curvature, refraction and collimation error that a single long sight cannot.' },
  { term: 'three-wire leveling', definition: 'Reading the upper, middle and lower crosshairs at every sight. The mean is a more precise reading, and the wire intervals check it and give the sight distance.' },
  { term: 'two-peg test', definition: 'A field check for collimation error: compare a reading taken midway between two pegs with one taken from near one peg. Equal differences mean the line of sight is level.' },
  { term: 'collimation error', definition: 'The line of sight not being truly horizontal when the instrument is level. It cancels when backsight and foresight distances are balanced.' },
  { term: 'earth curvature', definition: 'The drop of the level surface away from a horizontal line of sight, which makes a distant rod reading too large. It grows with the square of the sight distance.' },
  { term: 'refraction', definition: 'The bending of the line of sight downward through the atmosphere, which makes a distant rod reading too small. It partly offsets earth curvature.' },
  { term: 'curvature and refraction', definition: 'The combined correction for the earth’s curvature and atmospheric refraction, about 0.0206 F² feet with F in thousands of feet. It is always subtracted from a rod reading.' },
  { term: 'loop misclosure', definition: 'The amount by which a level circuit fails to return to its starting elevation. Allowable misclosure is usually stated as a constant times √(distance leveled).' },
  { term: 'geoid undulation', definition: 'The separation between the geoid and the ellipsoid at a point, N. It converts a GNSS ellipsoidal height to an orthometric elevation via H = h − N, and is negative across most of the United States.' },
  { term: 'vertical datum', definition: 'The reference surface elevations are measured from, such as NAVD88 in North America. NGVD29 is the older datum and differs from NAVD88 by a location-dependent amount.' },

  // ── Angles, directions and distance measurement ───────────────────────────────────────────────
  { term: 'back-azimuth', definition: 'The azimuth of a line viewed from its far end — the forward azimuth ±180°. Add 180° if the forward azimuth is under 180°, subtract if over.' },
  { term: 'back-bearing', definition: 'The bearing of a line read from the opposite end: the same numerical angle with both letters reversed, so N45°E becomes S45°W.' },
  { term: 'interior angle', definition: 'An angle inside a closed polygon traverse. For n sides the interior angles must total (n−2)×180°, which is the traverse’s angular check.' },
  { term: 'magnetic declination', definition: 'The angle between magnetic north and true north at a place and date. Add east declination and subtract west declination to convert a magnetic bearing to true.' },
  { term: 'zenith angle', definition: 'A vertical direction measured down from the upward vertical, so a horizontal sight is 90°. Modern total stations read zenith angles rather than vertical angles.' },
  { term: 'vertical angle', definition: 'A direction measured up or down from horizontal, positive above and negative below. It relates to the zenith angle as V = 90° − z.' },
  { term: 'instrument constant', definition: 'A fixed additive error in an EDM/prism pair, the same at every distance. Determined by baseline calibration and applied to every measured length.' },
  { term: 'parts per million', definition: 'A proportional error scaling with distance — 1 ppm is 1 mm per kilometre. EDM scale error and atmospheric corrections are both stated this way.' },
  { term: 'slope distance', definition: 'The straight-line distance between two points along the line of sight. It must be reduced to horizontal distance before use in a traverse.' },
  { term: 'horizontal distance', definition: 'The distance between two points projected onto a horizontal plane — slope distance × sin(zenith angle). Traverse computations use this, never slope distance.' },
  { term: 'sag correction', definition: 'A correction for a tape hanging in a catenary between supports, which always measures the distance too long. Always negative.' },
  { term: 'tension correction', definition: 'A correction for pulling a tape at other than its standardised tension, which stretches or shortens it elastically.' },
  { term: 'temperature correction', definition: 'A correction for a tape being at other than its standardised temperature, since steel expands when warm and contracts when cold.' },
  { term: 'standardization', definition: 'Comparing a tape or EDM against a known baseline to find its true length or constant, so a systematic error can be removed rather than tolerated.' },
  { term: 'direct and reverse', definition: 'Observing an angle in both instrument faces and averaging. This cancels most instrumental errors, including collimation and horizontal-axis error.' },
  { term: 'multipath', definition: 'Signal reaching the antenna after bouncing off a nearby surface, arriving late and corrupting the range. It is site-specific and is not removed by differencing.' },

  // ── Traverse and coordinate geometry ──────────────────────────────────────────────────────────
  { term: 'northing', definition: 'The north–south coordinate of a point, the y value in a survey coordinate system. Latitudes accumulate into northings.' },
  { term: 'easting', definition: 'The east–west coordinate of a point, the x value in a survey coordinate system. Departures accumulate into eastings.' },
  { term: 'inverse', definition: 'Computing the distance and direction between two known coordinate pairs — the reverse of a forward computation. The R▸P conversion on a calculator does it directly.' },
  { term: 'forward computation', definition: 'Computing the coordinates of a new point from a known point plus a bearing and distance, by resolving the line into its latitude and departure.' },
  { term: 'open traverse', definition: 'A traverse that neither returns to its start nor ends on another known point. It has no check on its work and no way to detect a blunder.' },
  { term: 'closed loop traverse', definition: 'A traverse that begins and ends on the same point, forming a polygon. Its angles and its latitudes and departures both provide a check.' },
  { term: 'link traverse', definition: 'A closed-connecting traverse that starts on one known point and ends on a different known point, checking against published values at both ends.' },
  { term: 'linear misclosure', definition: 'The straight-line distance between where a traverse closed and where it should have closed: √(ΣLat² + ΣDep²).' },
  { term: 'balancing a traverse', definition: 'Distributing angular and linear misclosure through a traverse so it closes exactly, by the compass rule, transit rule or least squares.' },
  { term: 'area by coordinates', definition: 'Computing the area of a closed figure from the coordinates of its corners by the shoelace formula: half the absolute value of the cross-multiplied sums.' },
  { term: 'double meridian distance', definition: 'A pre-calculator method of computing traverse area from latitudes and departures. Coordinate methods have replaced it, but the term still appears in older descriptions.' },
  { term: 'intersection', definition: 'Fixing a new point from two known points — by two bearings, two distances, or a bearing and a distance. Bearing–bearing, bearing–distance and distance–distance are the three cases.' },
  { term: 'resection', definition: 'Fixing the position of the instrument itself by observing several points of known position. The reverse of intersection.' },

  // ── Areas, volumes and earthwork ──────────────────────────────────────────────────────────────
  { term: 'trapezoidal rule', definition: 'Approximating an irregular area from offsets at a constant interval, treating each strip as a trapezoid. Less accurate than Simpson’s rule but works with any number of offsets.' },
  { term: 'simpson’s rule', definition: 'Approximating an irregular area by fitting parabolas through the offsets. More accurate than the trapezoidal rule, but it requires an odd number of offsets at equal spacing.' },
  { term: 'prismoidal formula', definition: 'A more exact volume than average end area, weighting the mid-section four times: V = L(A₁ + 4Aₘ + A₂)/6. Aₘ comes from the mid-section’s own dimensions, not from averaging the ends.' },
  { term: 'prismoidal correction', definition: 'The amount subtracted from an average-end-area volume to give the prismoidal volume, significant when the cross-section changes shape rapidly.' },
  { term: 'shrinkage', definition: 'The volume loss when loose excavated material is compacted into an embankment, so more cut is needed than the fill volume suggests.' },
  { term: 'swell', definition: 'The volume increase when in-place material is excavated and loosened, which governs haul and truck counts rather than embankment quantities.' },
  { term: 'cut and fill', definition: 'Material excavated (cut) and material placed (fill) on an earthwork project. Balancing the two minimises haul and waste.' },
  { term: 'mass diagram', definition: 'A plot of cumulative earthwork volume against station, used to plan haul direction and distance and to find where cut and fill balance.' },

  // ── Horizontal and vertical curves ────────────────────────────────────────────────────────────
  { term: 'point of curvature', definition: 'The PC — where a horizontal alignment leaves the back tangent and the circular curve begins.' },
  { term: 'point of tangency', definition: 'The PT — where the circular curve ends and the forward tangent begins. PT station = PC station + curve length.' },
  { term: 'point of intersection', definition: 'The PI — where the two tangents would meet if extended. The intersection angle at the PI equals the curve’s central angle.' },
  { term: 'tangent distance', definition: 'The distance from the PC or PT to the PI along a tangent: T = R·tan(Δ/2).' },
  { term: 'external distance', definition: 'The distance from the PI to the midpoint of the curve, measured along the bisector of the intersection angle.' },
  { term: 'middle ordinate', definition: 'The distance from the midpoint of the long chord to the midpoint of the curve. It is what governs sight distance around an obstruction.' },
  { term: 'long chord', definition: 'The straight line joining the PC and the PT of a circular curve.' },
  { term: 'central angle', definition: 'The angle Δ subtended at the centre of a circular curve, equal to the deflection between the two tangents. Curve length L = RΔ in radians.' },
  { term: 'equal-tangent parabola', definition: 'The standard vertical curve, with equal tangent lengths either side of the PVI. Elevations are computed as tangent elevation plus a tangent offset that grows with the square of the distance from the PVC.' },
  { term: 'crest curve', definition: 'A vertical curve where the grade decreases — over a hill. Its high point is where the grade passes through zero, and sight distance governs its length.' },
  { term: 'sag curve', definition: 'A vertical curve where the grade increases — through a dip. Headlight sight distance and drainage usually govern its length.' },
  { term: 'tangent offset', definition: 'The vertical distance from the tangent line down to the parabolic curve, proportional to the square of the horizontal distance from the PVC.' },

  // ── GNSS, geodesy, datums and projections ─────────────────────────────────────────────────────
  { term: 'pseudorange', definition: 'A satellite-to-receiver distance from code timing, biased by the receiver clock error. Four satellites resolve position and that clock bias together.' },
  { term: 'carrier phase', definition: 'Measuring range by counting cycles of the satellite carrier wave. Far more precise than code, but it carries an unknown integer ambiguity that must be resolved.' },
  { term: 'integer ambiguity', definition: 'The unknown whole number of carrier wavelengths between satellite and receiver. Fixing it is what takes a carrier-phase solution from decimetre to centimetre accuracy.' },
  { term: 'cycle slip', definition: 'A momentary loss of lock that breaks the continuous carrier count, usually under trees or near buildings. The ambiguity must be re-resolved afterwards.' },
  { term: 'differencing', definition: 'Combining observations from two or more receivers or satellites to cancel errors common to both — satellite clock, orbit, and most atmospheric delay. It does not remove multipath.' },
  { term: 'static gnss', definition: 'Occupying a point for an extended session and post-processing against a base or CORS. The most accurate GNSS technique and the standard for control.' },
  { term: 'network rtk', definition: 'RTK corrections modelled across a network of reference stations and delivered over the internet, often as a virtual reference station. It removes the need for a local base.' },
  { term: 'cors', definition: 'Continuously Operating Reference Stations — permanent GNSS receivers whose published data supports post-processing and network RTK.' },
  { term: 'opus', definition: 'The NGS Online Positioning User Service, which post-processes a submitted static GNSS file against CORS and returns published-datum coordinates.' },
  { term: 'precise point positioning', definition: 'Positioning a single receiver using precise satellite orbit and clock products rather than a nearby base. It needs a long convergence time but no local reference station.' },
  { term: 'dilution of precision', definition: 'A number describing how satellite geometry amplifies ranging error into position error. Lower is better; a low DOP with poor ranging still gives a poor position.' },
  { term: 'gdop', definition: 'Geometric dilution of precision — the overall effect of satellite geometry on the 3-D position and time solution.' },
  { term: 'pdop', definition: 'Position dilution of precision, the geometry factor for the three-dimensional position alone.' },
  { term: 'hdop', definition: 'Horizontal dilution of precision, the geometry factor for the horizontal position.' },
  { term: 'vdop', definition: 'Vertical dilution of precision. It is normally worse than horizontal DOP because satellites are only ever seen above the horizon.' },
  { term: 'user equivalent range error', definition: 'The combined ranging error to a single satellite from all sources. Position error is roughly UERE × DOP.' },
  { term: 'ionospheric delay', definition: 'Signal delay through the charged upper atmosphere. It is frequency-dependent, so a dual-frequency receiver can model and remove most of it.' },
  { term: 'tropospheric delay', definition: 'Signal delay through the lower, neutral atmosphere. It is not frequency-dependent, so it must be modelled rather than differenced away by frequency.' },
  { term: 'ephemeris', definition: 'The satellite orbit data a receiver needs to compute where each satellite was when it transmitted. Broadcast versions are approximate; precise versions come later.' },
  { term: 'geodetic datum', definition: 'The ellipsoid plus its orientation and origin, defining the coordinate frame. NAD83 and WGS84 differ by roughly a metre, which matters for boundary work.' },
  { term: 'wgs84', definition: 'The World Geodetic System 1984, the reference frame GPS broadcasts in. It agrees with NAD83 only to about a metre.' },
  { term: 'map projection', definition: 'A mathematical transformation of the curved earth onto a flat plane. Every projection distorts something; a conformal projection preserves angles and shape locally.' },
  { term: 'conformal projection', definition: 'A projection preserving local angles and shape, so a small figure keeps its form and scale is the same in every direction at a point. All State Plane zones are conformal.' },
  { term: 'state plane coordinate system', definition: 'A set of plane coordinate zones covering the US, each sized so scale distortion stays within about 1:10,000. Zones use Lambert Conformal Conic or Transverse Mercator by their shape.' },
  { term: 'grid distance', definition: 'A distance on the projection surface, which is what plane coordinates compute. It differs from ground distance by the combined factor.' },
  { term: 'ground distance', definition: 'The horizontal distance actually measured on the earth’s surface. Divide by the combined factor to get grid distance; multiply to go back.' },
  { term: 'grid north', definition: 'The direction of the northing axis of a projection. It differs from true north by the convergence angle everywhere except the central meridian.' },
  { term: 'geodetic north', definition: 'The direction of the meridian through a point — true north. Distinct from grid north and from magnetic north.' },
  { term: 'arc-to-chord correction', definition: 'The small angular correction between a geodetic line and its straight-line grid equivalent, sometimes written (t−T). Negligible on short lines, real on long ones.' },

  // ── Public Land Survey System ─────────────────────────────────────────────────────────────────
  { term: 'public land survey system', definition: 'The rectangular survey system laid out over most federal public-domain land, dividing it into townships, sections and aliquot parts. Texas was never public domain, so the PLSS does not apply there.' },
  { term: 'principal meridian', definition: 'The north–south line through an initial point from which PLSS ranges are numbered east and west.' },
  { term: 'base line', definition: 'The east–west line through an initial point from which PLSS townships are numbered north and south.' },
  { term: 'township', definition: 'In the PLSS, a nominal six-mile square containing 36 sections. Also the north–south position in a description, as in T2N.' },
  { term: 'range', definition: 'The east–west position of a township relative to the principal meridian, numbered east or west, as in R4E.' },
  { term: 'section', definition: 'A nominal one-square-mile unit of a PLSS township, about 640 acres. Sections are numbered 1 to 36 boustrophedonically, starting at the northeast corner.' },
  { term: 'aliquot part', definition: 'A legal subdivision of a section by repeated halving and quartering — the NE¼, the SW¼ of the NE¼, and so on. Read the description right to left to locate it.' },
  { term: 'quarter section', definition: 'One quarter of a section, nominally 160 acres.' },
  { term: 'quarter-quarter section', definition: 'One sixteenth of a section, nominally 40 acres — the "forty" of common speech.' },
  { term: 'government lot', definition: 'An irregular PLSS parcel that cannot be described as a regular aliquot part, typically along a water boundary or against a township correction line, with its acreage stated on the plat.' },
  { term: 'standard parallel', definition: 'An east–west correction line in the PLSS where township boundaries are re-established, absorbing the convergence of meridians. Also called a correction line.' },
  { term: 'guide meridian', definition: 'A north–south correction line run at intervals from a standard parallel, offsetting to absorb meridian convergence.' },
  { term: 'existent corner', definition: 'An original corner whose position can still be identified, either by its own monument or by acceptable evidence of where it stood. It controls, whatever the measurements say.' },
  { term: 'proportionate measurement', definition: 'Restoring a lost corner by distributing the difference between record and measured distances proportionally between controlling existent corners. It is the method of last resort.' },
  { term: 'corner accessory', definition: 'A physical object recorded as tying to a corner — a bearing tree, mound, pit or memorial. Accessories can prove an obliterated corner’s position after the monument is gone.' },
  { term: 'bearing tree', definition: 'A tree blazed and scribed, with its bearing and distance to the corner recorded, so the corner can be recovered after the monument is lost.' },

  // ── Boundary law and land descriptions ────────────────────────────────────────────────────────
  { term: 'lot and block', definition: 'A description referring to a lot within a recorded subdivision plat, which supplies the dimensions rather than repeating them.' },
  { term: 'dignity of calls', definition: 'The priority order for resolving conflicting calls in a description: natural monuments, then artificial monuments, then adjoiners, then courses and distances, then area. Also called priority of calls.' },
  { term: 'footsteps of the original surveyor', definition: 'The governing principle of retracement — the object is to find where the original survey actually ran, not to establish where it should have run.' },
  { term: 'senior rights', definition: 'The principle that the earlier-created parcel takes its full described extent, and any shortage or overlap falls on the junior parcel conveyed later.' },
  { term: 'simultaneous conveyance', definition: 'Parcels created at the same instant, as by a subdivision plat, so none is senior. Shortages are prorated among them rather than charged to one.' },
  { term: 'accretion', definition: 'The gradual, imperceptible deposit of soil along a water boundary. Title follows it, so the owner gains the new land.' },
  { term: 'erosion', definition: 'The gradual, imperceptible wearing away of land along a water boundary. The boundary moves with it and the owner loses the land.' },
  { term: 'reliction', definition: 'The gradual withdrawal of water exposing previously submerged land. Like accretion, the boundary follows the water.' },
  { term: 'avulsion', definition: 'A sudden, perceptible change in a watercourse — a river cutting a new channel in a flood. The boundary stays where it was; it does not follow the water.' },
  { term: 'appurtenant easement', definition: 'An easement benefiting a particular parcel and transferring automatically with it, rather than belonging to an individual.' },
  { term: 'chain of title', definition: 'The successive recorded conveyances tracing ownership of a parcel back through time. Gaps or breaks in it are what a title search exists to find.' },
  { term: 'constructive notice', definition: 'Notice the law presumes everyone has of a properly recorded instrument, whether or not they actually read it.' },
  { term: 'race-notice', definition: 'A recording statute under which a later purchaser prevails only if they took without notice of the earlier deed and recorded first. Contrast with pure race and pure notice states.' },
  { term: 'warranty deed', definition: 'A deed in which the grantor warrants clear title and will defend it. A quitclaim deed transfers only whatever interest the grantor happens to hold, with no warranty.' },
  { term: 'quitclaim deed', definition: 'A deed conveying whatever interest the grantor has, with no warranty that they hold any interest at all. Common for clearing clouds on title.' },

  // ── Mapping, photogrammetry and GIS ───────────────────────────────────────────────────────────
  { term: 'principal point', definition: 'The point where the optical axis of an aerial camera meets the photograph — the geometric centre from which radial distortions emanate.' },
  { term: 'orthophoto', definition: 'An aerial photograph corrected for camera tilt and terrain relief so that it has uniform scale and can be measured like a map.' },
  { term: 'contour interval', definition: 'The constant elevation difference between adjacent contour lines on a map. It is chosen for the terrain and the map’s purpose.' },
  { term: 'metadata', definition: 'Data describing the data — its source, date, accuracy, datum and projection. Without it a coordinate file cannot be safely used.' },
  { term: 'digital terrain model', definition: 'A digital representation of the bare-earth surface, as a TIN or a grid, from which contours, profiles and volumes are derived.' },

  // ── Instruments, practice and the exam itself ─────────────────────────────────────────────────
  { term: 'ncees', definition: 'The National Council of Examiners for Engineering and Surveying, which writes and administers the FS and PS exams and publishes the Reference Handbook.' },
  { term: 'fs exam', definition: 'The Fundamentals of Surveying exam — the first licensure exam, computer-based and closed-book apart from the supplied on-screen reference handbook.' },
  { term: 'reference handbook', definition: 'The searchable on-screen formula reference supplied during the exam. It is the only reference permitted, so knowing its layout is part of preparing.' },
  { term: 'pearson vue', definition: 'The testing-centre network that administers the NCEES computer-based exams.' },
  { term: 'degrees minutes seconds', definition: 'The sexagesimal form of an angle — 112°00′25″ — where each degree is 60 minutes and each minute 60 seconds. Convert to decimal degrees before any trigonometry.' },
  { term: 'taping', definition: 'Measuring distance directly with a steel tape (chaining). It needs corrections for temperature, tension, sag, slope and the tape’s own standardised length.' },
  { term: 'point of vertical curvature', definition: 'The PVC — where a vertical alignment leaves the back grade and the parabolic curve begins. Tangent offsets are measured from here.' },
  { term: 'point of vertical tangency', definition: 'The PVT — where the vertical curve ends and the forward grade begins.' },
  { term: 'point of vertical intersection', definition: 'The PVI — where the two grade lines would meet if extended. On an equal-tangent curve it sits midway between the PVC and PVT in station.' },
  { term: 'bureau of land management', definition: 'The federal agency that inherited the General Land Office’s role and now administers the PLSS and its surveying manual.' },
  { term: 'general land office', definition: 'The historical federal office that ran the original PLSS surveys and disposed of public-domain land. Its role passed to the Bureau of Land Management.' },
  { term: 'geographic information system', definition: 'A system for storing, analysing and displaying spatially referenced data, combining geometry with attributes and their metadata.' },
  { term: 'earthwork', definition: 'The excavation and placement of soil and rock on a project, and the computation of those volumes from cross-sections or surfaces.' },
  { term: 'absolute value', definition: 'A quantity’s magnitude without its sign. Area by coordinates takes the absolute value at the end, since a clockwise figure yields a negative sum.' },
  { term: 'cubic yard', definition: 'The customary unit of earthwork volume — 27 cubic feet. Divide cubic feet by 27 once at the end of a computation, never partway through.' },
  { term: 'reflectorless', definition: 'EDM measurement to a bare surface with no prism. Convenient and less accurate, and the returned point is wherever the beam actually struck.' },
  { term: 'robotic total station', definition: 'A total station that tracks and is controlled from the prism pole, letting one person run the instrument from the point being measured.' },
  { term: 'horizontal angle', definition: 'The angle between two directions measured in a horizontal plane. Interior, deflection and angle-right are all horizontal angles described by how they are referenced.' },
  { term: 'stereoscopic', definition: 'Viewing two overlapping photographs so that the terrain appears three-dimensional, which is what allows elevations to be measured photogrammetrically.' },
  { term: 'control survey', definition: 'A survey establishing accurate horizontal or vertical positions that later work is referenced to. Control is set first and to a higher order than the work it supports.' },
  { term: 'as-built survey', definition: 'A survey recording what was actually constructed, as against what was designed. It documents the finished positions and elevations for the record.' },
  { term: 'topographic survey', definition: 'A survey locating the natural and man-made features and elevations of a site, usually delivered as contours and a feature map.' },
  { term: 'alta survey', definition: 'An ALTA/NSPS Land Title Survey — a boundary survey to a national standard specification, produced for title insurance and commercial transactions.' },
  { term: 'coordinates', definition: 'A pair or triple of numbers fixing a point in a stated reference frame — normally northing, easting and elevation. Coordinates mean nothing without the datum and projection they belong to.' },
  { term: 'elevation', definition: 'Height above a vertical datum, measured along the plumb line — the orthometric height. Distinct from the ellipsoidal height a GNSS receiver reports.' },

  // The plain quantities. Lessons bold these constantly — they are the vocabulary of every
  // computation, and a student new to the subject is entitled to ask what each one means.
  { term: 'distance', definition: 'The separation between two points. In survey computations it must be the horizontal distance; slope distance and grid distance are different quantities and are not interchangeable.' },
  { term: 'direction', definition: 'The orientation of a line relative to a meridian, expressed as a bearing or an azimuth. A direction is meaningless until the meridian it refers to is stated.' },
  { term: 'area', definition: 'The extent of a surface enclosed by a boundary, reported in square feet, acres or hectares. One acre is 43,560 square feet.' },
  { term: 'volume', definition: 'The quantity of material between two surfaces or cross-sections, reported in cubic yards for earthwork. Divide cubic feet by 27 once, at the end.' },
  { term: 'length', definition: 'The measured distance along a line or curve. For a circular curve, the arc length L = RΔ with Δ in radians.' },
  { term: 'angle', definition: 'The difference in direction between two lines, measured horizontally or vertically. Horizontal angles position a traverse; vertical or zenith angles reduce slope distances.' },
  { term: 'station', definition: 'A distance along an alignment from its origin, written as 12+34.56 for 1,234.56 feet. Stationing is how every point on a route survey is referenced.' },
  { term: 'offset', definition: 'A perpendicular distance from a baseline or alignment to a point. Offsets at a constant interval are what the trapezoidal and Simpson’s rules integrate.' },
  { term: 'grade', definition: 'The slope of a line expressed as a percentage — rise over run × 100. A +2% grade climbs two feet in a hundred.' },
  { term: 'baseline', definition: 'A reference line from which offsets are measured, or a calibrated line of known length used to standardise an EDM. Distinct from the PLSS base line.' },
  { term: 'adjustment', definition: 'Distributing misclosure through a survey so it closes exactly and every observation is honoured as far as its reliability allows.' },
  { term: 'course', definition: 'One line of a traverse or description, given as a bearing and a distance. A metes-and-bounds description is a sequence of courses.' },
  { term: 'conversion', definition: 'Changing a quantity between units or forms — feet to metres, DMS to decimal degrees, bearing to azimuth. Working in consistent units is what prevents most computation blunders.' },
  { term: 'consistent units', definition: 'Using one unit system throughout a computation. Mixing feet with metres, or degrees with radians, is the most common source of an answer that is wrong by a clean factor.' },
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

  // ── Added 2026-08-06 alongside the term sweep ────────────────────────────────────────────────
  // Every abbreviation and alternate phrasing found bolded in the lesson seeds, so a student
  // clicking the form the lesson actually uses gets the curated definition rather than an AI call.
  // Spelled-out ↔ abbreviation, pointing AT the canonical entry. The reverse direction ('edm' →
  // the long form) was a dead alias: 'edm' is itself an entry, so the alias could never be reached.
  'electronic distance measurement': 'edm',
  'north american vertical datum': 'navd88',
  'bs': 'backsight',
  'fs': 'foresight',
  'tp': 'turning point',
  'mpv': 'most probable value',
  'sx': 'sample standard deviation',
  'dms': 'degrees minutes seconds',
  'ppm': 'parts per million',
  'dop': 'dilution of precision',
  'uere': 'user equivalent range error',
  'ppp': 'precise point positioning',
  'rtn': 'network rtk',
  'vrs': 'network rtk',
  'ppk': 'rtk',
  'plss': 'public land survey system',
  'blm': 'bureau of land management',
  'glo': 'general land office',
  'pc': 'point of curvature',
  'pt': 'point of tangency',
  'pi': 'point of intersection',
  'pvc': 'point of vertical curvature',
  'pvt': 'point of vertical tangency',
  'pvi': 'point of vertical intersection',
  'ltm': 'transverse mercator',
  'lcc': 'lambert conformal conic',
  'tm': 'transverse mercator',
  'dtm': 'digital terrain model',
  'dem': 'digital terrain model',
  'gis': 'geographic information system',
  'sf': 'scale factor',
  'ef': 'elevation factor',
  'sea-level factor': 'elevation factor',
  'sea level factor': 'elevation factor',
  'bowditch': 'compass rule',
  'shoelace': 'area by coordinates',
  'shoelace formula': 'area by coordinates',
  'dmd': 'double meridian distance',
  'double meridian distance': 'double meridian distance',
  'closed-loop traverse': 'closed loop traverse',
  'closed loop': 'closed loop traverse',
  'closed-connecting traverse': 'link traverse',
  'link': 'link traverse',
  'aliquot parts': 'aliquot part',
  'aliquot': 'aliquot part',
  'forty': 'quarter-quarter section',
  'quarter quarter': 'quarter-quarter section',
  'correction line': 'standard parallel',
  'correction lines': 'standard parallel',
  'priority of calls': 'dignity of calls',
  'dignity': 'dignity of calls',
  'junior rights': 'senior rights',
  'senior/junior rights': 'senior rights',
  'metes-and-bounds': 'metes and bounds',
  'lot-and-block': 'lot and block',
  'simultaneous': 'simultaneous conveyance',
  'notice': 'constructive notice',
  'geoid undulation n': 'geoid undulation',
  'orthometric height h': 'orthometric height',
  'ellipsoidal height h': 'ellipsoidal height',
  'ellipsoidal heights h': 'ellipsoidal height',
  'orthometric heights h': 'orthometric height',
  'ngvd29': 'vertical datum',
  'geoid2022': 'geoid',
  'grs80': 'ellipsoid',
  'curvature': 'earth curvature',
  'collimation': 'collimation error',
  'zenith': 'zenith angle',
  'back azimuth': 'back-azimuth',
  'back bearing': 'back-bearing',
  'declination': 'magnetic declination',
  'chaining': 'taping',
  'sag': 'sag correction',
  'swell factor': 'swell',
  'shrinkage factor': 'shrinkage',
  'average-end-area': 'average end area',
  'external distance': 'external distance',
  'crest': 'crest curve',
  'carrier': 'carrier phase',
  'ambiguity': 'integer ambiguity',
  'cycle slips': 'cycle slip',
  'static': 'static gnss',
  'convergence angle': 'convergence',
  'mapping angle': 'convergence',
  'grid': 'grid distance',
  'ground': 'ground distance',
  'conformal': 'conformal projection',
  'projection': 'map projection',
  'lidar': 'lidar',
  'metes and bounds description': 'metes and bounds',
  'state plane': 'state plane coordinate system',
  'spcs83': 'state plane coordinate system',
  // NOT aliased: 'coordinates' → 'area by coordinates', 'curves' → 'central angle',
  // 'permit-required' → 'easement'. Each was tempting and each would have answered a student's
  // click with a definition of something adjacent but different. On an exam-prep surface a
  // confidently wrong definition is worse than none, so these get their own entries or nothing.
  'elevations': 'elevation',
  'cubic yards': 'cubic yard',
  'appurtenant': 'appurtenant easement',
  'robotic': 'robotic total station',
  'stereo': 'stereoscopic',
  'alta': 'alta survey',
  'alta/nsps': 'alta survey',
  'as-built': 'as-built survey',
  'topo': 'topographic survey',
  'monuments': 'monument',
  'natural monument': 'monument',
  'artificial monument': 'monument',
  'gaussian distribution': 'normal distribution',
  'unit-normal table': 'normal distribution',
  'z-value': 'normal distribution',
  'polygon traverse': 'closed loop traverse',
  'height-of-instrument': 'height of instrument',
  'minus sight': 'foresight',
  'plus sight': 'backsight',
  'atmospheric refraction': 'refraction',
  'quadrature': 'combine in quadrature',
  'mid-section': 'prismoidal formula',
  'end areas': 'average end area',
};

const MAP = new Map<string, GlossaryEntry>();
for (const e of ENTRIES) MAP.set(e.term.toLowerCase(), e);

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    // Curly apostrophes and dashes: lesson prose uses ’ and – where the glossary keys use ' and -.
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[.,;:!?()"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Progressively looser forms of a clicked term, tried in order.
 *
 *  Lessons bold a term the way it reads in a sentence, not the way a glossary keys it —
 *  "backsight (BS)", "orthometric height H", "Zenith angle (Z)", "the geoid". Each variant below
 *  strips one of those habits so a real term still resolves instead of falling through to the AI
 *  route and costing a request for something already written down. */
function variants(n: string, raw: string): string[] {
  const out = [n];
  const push = (s: string) => { const t = s.trim(); if (t && !out.includes(t)) out.push(t); };

  // Parentheticals. Lessons habitually gloss a term inline — "EDM (electronic distance
  // measurement)", "Compass (Bowditch) rule", "height-of-instrument (HI) method". `normalize` only
  // strips the brackets, which welds the gloss onto the term and matches nothing, so try the
  // sentence with the parenthetical removed AND the parenthetical on its own. Between them one is
  // almost always the real key.
  if (raw.includes('(')) {
    push(normalize(raw.replace(/\([^)]*\)/g, ' ')));
    for (const m of raw.matchAll(/\(([^)]*)\)/g)) push(normalize(m[1]));
  }
  // Trailing qualifier words the lesson adds to make a term read as a noun phrase.
  push(n.replace(/\s+(method|rule|formula|correction|error|traverse|curve|distance|angle)$/, ''));

  // "backsight bs" ← the parenthetical was already stripped by normalize; drop a trailing
  // all-caps-looking abbreviation or lone symbol: "orthometric height h", "zenith angle z".
  push(n.replace(/\s+[a-zα-ω]{1,3}$/i, ''));
  // Leading article: "the geoid", "a benchmark".
  push(n.replace(/^(the|a|an)\s+/, ''));
  // Hyphen/space equivalence, both directions.
  push(n.replace(/-/g, ' '));
  push(n.replace(/\s+/g, '-'));
  // Possessive: "simpson's rule" is keyed with the apostrophe stripped by normalize already,
  // but "surveyors report" style plurals still want the singular.
  if (n.endsWith('s')) push(n.slice(0, -1));
  if (n.endsWith('es')) push(n.slice(0, -2));
  if (n.endsWith('ies')) push(`${n.slice(0, -3)}y`);
  return out;
}

/** Words an author bolds for stress. Never a glossary entry, and never worth an AI request. */
const STRESS_WORDS = new Set(`not never always must all any only both each same different more less
larger smaller greater higher lower first second third last next previous before after above below
moves move increases decreases add added subtract yes no true false negative positive zero one two
three important note remember warning caution tip example examples key summary solution answer given
find step steps part parts new old best worst good bad right wrong correct incorrect long short
cancels meaning degrees over under within outside too high low the a an of in on at is are be`.split(/\s+/));

/** Verbs a lesson opens an instruction with. "Always run the arithmetic check" is advice, not a term. */
const IMPERATIVES = /^(always|never|remember|memorize|confirm|report|store|read|use|add|check|apply|note|see|watch|avoid|keep|make|do|don't|set|write|draw|convert|round)\b/i;

/** Is this bolded run something a definition could sensibly be written for?
 *
 *  ── WHY THIS EXISTS (2026-08-06) ──────────────────────────────────────────────────────────────
 *
 *  The lesson renderer turns every `**bolded**` run into a clickable term, and authors bold far
 *  more than terminology. Of 1,551 distinct bolded runs in the FS seeds, roughly two thirds are
 *  emphasis (`**not**`), formulas (`**H = h − N**`), angle values (`**112°00′25″**`), bare numbers
 *  (`**43,560**`), calculator keys (`**▸DMS**`, `**DEG**`), symbols (`**x̄**`) and section headings
 *  (`**Solution.**`).
 *
 *  Before this, clicking any of them opened a popup that asked Claude to define it. That is a
 *  request and a wait for something that has no definition — and the model, asked to define
 *  "Note" for a surveying student, obliges with a plausible paragraph about surveyors' notes. A
 *  confident answer to a question nobody asked is worse on an exam-prep surface than no popup.
 *
 *  So: a glossary hit always opens. Anything else opens only if it still looks like terminology. */
export function looksLikeTerm(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (lookupTerm(t)) return true;                                   // curated always wins

  if (t.length > 60) return false;                                  // a bolded sentence
  if (t.split(/\s+/).length > 6) return false;
  if (/[=+×·√²³∑Δ]/.test(t)) return false;                          // a formula
  if (/[°′″]/.test(t)) return false;                                // an angle value
  if (/^[\d.,%$:−+\-/]+/.test(t)) return false;                     // starts with a number
  if (/[.!?]$|:$/.test(t)) return false;                            // a heading or sentence
  if (/[▸→←↔]/.test(t)) return false;                               // a calculator key
  if (t.replace(/[^A-Za-zÀ-ſ]/g, '').length <= 2) return false;     // a symbol
  if (IMPERATIVES.test(t)) return false;                            // an instruction, not a term

  // Emphasis — either the whole run is one stress word, or every word in it is. The second form
  // catches phrases like "too high" and "always negative" that no single-word check would.
  const words = t.toLowerCase().split(/\s+/);
  if (words.every((w) => STRESS_WORDS.has(w.replace(/[^a-z']/g, '')))) return false;

  return true;
}

/** Look up a term (alias-, plural- and phrasing-aware). Returns null when not in the glossary. */
export function lookupTerm(raw: string): GlossaryEntry | null {
  const n = normalize(raw);
  if (!n) return null;
  for (const v of variants(n, raw)) {
    const direct = MAP.get(v);
    if (direct) return direct;
    const aliased = ALIASES[v];
    if (aliased) {
      const hit = MAP.get(aliased);
      if (hit) return hit;
    }
  }
  return null;
}
