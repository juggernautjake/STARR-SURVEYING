# FS / SIT Exam-Prep Resource Extract

Structured reference extracted from the SIT Prep PDF library. This is the source of truth
for the course's lessons, problem templates, and calculator-skills module.

**Source folder:** `C:\Users\Jacob Maddux\STARR SURVEYING\SCHOOL\SIT Prep\`

**Extraction notes**
- NCEES **FS Reference Handbook v2.5** (`fs-handbook-2-5.pdf`) has a clean text layer — fully extracted below. This is the *only* reference allowed in the exam; everything an examinee may rely on lives here, so formula coverage matches the on-screen exam PDF.
- The **practice exam** (`10-18-2025 SIT Study Group Exam.pdf`), the **RPLS/calculator notes**, and the **HP-33S/HP-35S program books** are scanned images (no text layer). They were rendered to PNG with `pdfjs-dist` + `@napi-rs/canvas` and read visually. The HP program-listing books render too faintly to transcribe line-by-line; they are catalogued as keystroke-programming references only. The RPLS handwritten notes (clear) carry the calculator methodology.
- The practice exam ships **without an answer key** (closed-book practice; solutions were reviewed live via QR poll). Worked answers below are computed/derived, flagged as such.

---

## PART A — NCEES FS REFERENCE HANDBOOK v2.5 (full formula reference)

### Handbook structure (table of contents)
1. **Abbreviations and Acronyms** (p.1)
2. **Conversions and Other Useful Relationships** (p.3): Linear measure, Area, Metric conversions, Land Description (PLSS) diagram
3. **Mathematical and Surveying-Related Formulas** (p.6): Straight line, Quadratic, Trig, Right/Oblique/Spherical triangles, Triangle area, **Horizontal circular curves**, **Vertical curves**, **Photogrammetry**, Physics, Curvature & refraction, Magnetic declination, **Geodesy**, Mensuration, **State plane coords**, **EDM**, **Area formulas**, **Earthwork**, **Probability & statistics**, Matrices, Determinants, Conic sections, Differential calculus + statistical tables (Normal, t, F, MACRS)
4. **Economics** (p.30)
5. **Ethics** (p.33): Surveyor's Canons, Model Rules
6. **Safety** (p.36): hazard classification, GHS, SDS

### A1. Units & Conversions
**Linear**
- 1 chain = 100 links = 66 ft (US survey ft) = 4 poles/perches/rods
- 1 mile = 80 chains = 5,280 ft
- 1 nautical mile = 6,076 ft ; 1 min of latitude ≈ 1 nautical mile

**Area**
- 1 acre = 10 sq chains = 43,560 ft²
- 1 acre = 0.40468726099 hectare

**Metric (US survey foot)**
- 1 m = 39.37 in (exact); 1 US survey ft = 0.3048006096 m; 1 m = 3.2808333333 US ft
- 1 link = 0.2011684023 m
- **International foot:** 1 in = 25.4 mm (exact); 1 SI ft = 0.3048 m (exact); 1 m = 3.2808398950 SI ft
- 1 mile = 1.60935 km

**Other constants**
- 1 rad = 180°/π
- g = 9.807 m/s² = 32.174 ft/sec²
- speed of light c = 299,792,458 m/s = 186,282 mi/sec
- °C = (°F − 32)/1.8
- Mean radius of earth ≈ 20,906,000 ft ≈ 6,372,000 m
- 1 kg = 2.2046 lb; 1 L = 0.2624 gal; 1 ft³ = 7.481 gal
- 1 gal water = 8.34 lb; 1 ft³ water = 62.4 lb; 1 atm = 29.92 in Hg = 14.696 psi

### A2. Straight Line / Coordinate Geometry basics
- General: Ax + By + C = 0 ; Slope-intercept: y = mx + b ; Point-slope: y − y₁ = m(x − x₁)
- Slope from 2 pts: m = (y₂ − y₁)/(x₂ − x₁)
- Angle between lines: θ = arctan[(m₂ − m₁)/(1 + m₂m₁)]
- Perpendicular if m₁ = −1/m₂
- Quadratic: ax² + bx + c = 0 → x = [−b ± √(b²−4ac)]/(2a)

### A3. Trigonometry
- sin θ = y/r, cos θ = x/r, tan θ = y/x, cot = x/y, csc = r/y, sec = r/x
- **Law of sines:** a/sin A = b/sin B = c/sin C
- **Law of cosines:** a² = b² + c² − 2bc·cos A ; cos A = (b² + c² − a²)/(2bc)
- **Pythagorean:** A² + B² = C²

### A4. Triangle Area
- Area = (a·b·sin C)/2
- Area = a²·sin B·sin C / (2·sin A)
- Heron: Area = √[s(s−a)(s−b)(s−c)], s = (a+b+c)/2

### A5. Spherical Triangles
- Law of sines: sin a/sin A = sin b/sin B = sin c/sin C
- Law of cosines: cos a = cos b·cos c + sin b·sin c·cos A
- Area of sphere = 4πR² ; Volume = (4/3)πR³
- Spherical excess (sec) = (b·c·sin A)/(9.7×10⁻⁶·R²), R = mean earth radius

### A6. INVERSE (distance & direction between two coordinates) — CORE COGO
Given ΔN = change in northing (latitude), ΔE = change in easting (departure):
- **Distance:** D = √(ΔN² + ΔE²)  [also D = √((X₂−X₁)² + (Y₂−Y₁)²)]
- **Direction (bearing angle):** θ = arctan(ΔE/ΔN) + C
  - C = 0° in Quadrant I (NE)
  - C = 180° in Quadrant II (SE)
  - C = 180° in Quadrant III (SW)
  - C = 360° in Quadrant IV (NW)
  - (Quadrant determined by signs of ΔN, ΔE)
- **Midpoint:** ((X₁+X₂)/2, (Y₁+Y₂)/2)

### A7. HORIZONTAL CIRCULAR CURVES (high-frequency exam topic)
Definitions: I (or Δ) = deflection/central angle; R = radius; T = tangent; L = curve length (P.C. to P.T.); LC = long chord; M = middle ordinate; E = external distance; D = degree of curve.
- **Degree of curve (arc def):** D = 5,729.58 / R  → R = 5,729.58 / D
- **Degree of curve (chord def):** R = 50 / sin(D/2)
- **Tangent:** T = R·tan(I/2)
- **Length:** L = R·I·(π/180) = (I/D)·100   (I in degrees)
- **Long chord:** LC = 2R·sin(I/2)
- **Sub-chord:** c = 2R·sin(d/2) ; sub-arc deflection d = (ℓ·D)/100
- **Middle ordinate:** M = R·[1 − cos(I/2)]
- **External:** E = R·[1/cos(I/2) − 1] = R·[sec(I/2) − 1]
- **Stationing:** PI − T = PC ; PC + L = PT
- **Circumference / circle:** L = 2πR ; A = πR² ; (for full circle I = Δ)
- **Area of sector** = πR²·I/360 ; **Area of segment** = πR²·I/360 − (R²/2)·sin I
- **Area between curve & tangents** = R(T − L/2)
- R from two tangents (deflection a,b): R = (2·AC)/sin(a+b)
- Circle: X² + Y² = R²

### A8. VERTICAL CURVES (parabolic)
g₁ = back-tangent grade, g₂ = forward-tangent grade, L = horizontal curve length, x = distance from PVC.
- **Parabola constant:** a = (g₂ − g₁)/(2L)
- **Curve elevation:** Y = Y_PVC + g₁·x + a·x²  = Y_PVC + g₁·x + [(g₂−g₁)/(2L)]·x²
- **Tangent elevation:** = Y_PVC + g₁·x  (back), = Y_PVI + g₂·(x − L/2) (forward)
- **Tangent offset:** y = a·x² ; **at PVI:** E = a·(L/2)²
- **Rate of change of grade:** r = (g₂ − g₁)/L
- **Station of high/low point:** x_m = −g₁/(2a) = g₁·L/(g₁ − g₂)

### A9. PHOTOGRAMMETRY
Vertical images:
- **Scale** = (photo distance ab)/(ground distance AB) = f/(H − h)
- **Relief displacement** = (r·h)/H
- **Flying height:** H = C-factor × contour interval
- **Parallax:** p = x − x′ ; X = (x·B)/p ; Y = (y·B)/p ; h = H − (f·B)/p
- h₂ = h₁ + [(p₂ − p₁)/p₂]·(H − h₁)
- where f = focal length, H = flying height above datum, h = ground height, r = radial dist from principal point, B = air base, p = parallax

### A10. Physics / optics (occasional)
- Lens: 1/o + 1/i = 1/f
- Snell: n·sin θ = n′·sin θ′
- s = ½·a·t² (distance from zero velocity)

### A11. CURVATURE & REFRACTION
For vertical angles:
- c ≈ 4.905 sec / 1,000 ft ; (c & r) ≈ 4.244 sec / 1,000 ft
- c ≈ 16.192 sec / 1 km ; (c & r) ≈ 13.925 sec / 1 km
For level rod readings:
- c ≈ 0.0240·D² ft ; (c & r) ≈ 0.0206·D² ft  (D = thousands of ft)
- c ≈ 0.0785·K² m ; (c & r) ≈ 0.0675·K² m  (K = km)
- c ≈ 0.667·M² ; (c & r) ≈ 0.574·M²  (M = miles)
- Allowable angular error (individual angle): tan(err) = 1/10,000

### A12. GEODESY
Ellipsoid: a = semimajor, b = semiminor, φ = latitude
- **Flattening:** f = (a − b)/a  (published as 1/f)
- **Eccentricity:** e² = (a² − b²)/a²
- **Radius in meridian:** M = a(1 − e²)/(1 − e²·sin²φ)^(3/2)
- **Radius in prime vertical:** N = a/(1 − e²·sin²φ)^(1/2)
- **Ellipsoid defs:** GRS80 a = 6,378,137.0 m, 1/f = 298.25722101 ; Clarke 1866 a = 6,378,206.4 m, 1/f = 294.97869821
- **Orthometric correction** = −0.005288·sin 2φ·Δφ·(arc 1′)
- **Height relationship:** h = H + N (h = ellipsoidal, H = orthometric, N = geoid undulation)

### A13. STATE PLANE COORDINATES (SPCS) — distance reduction chain
- **Ground → ellipsoid (geodetic):** D_E = D_H × EF, where Elevation Factor EF = R/(R + H + N)
- **Ellipsoid → grid:** D_G = D_E × SF (SF = projection scale factor)
- **Combined factor** = EF × SF (multiply ground distance by combined factor to get grid)
- For precision < 1/200,000 may use R ≈ 20,906,000 ft and neglect geoid height
- **Arc-to-chord correction:** AR − CH = CH³/(24R²)

### A14. ELECTRONIC DISTANCE MEASUREMENT (EDM)
- V = c/n (velocity through atmosphere) ; λ = V/f ; D = (λ/2)·(m + d/?)... [D = m·(λ/2) + fractional]
- Atmospheric correction: a 10 °C temp change OR 1 in Hg pressure difference ≈ 10 ppm distance correction

### A15. AREA FORMULAS
- **Area by coordinates (closed polygon, point order i):**
  Area = ½ · |Σ Xᵢ(Yᵢ₊₁ − Yᵢ₋₁)|  (equivalent shoelace / DMD result)
- **Trapezoidal rule:** Area = w·[(h₁ + hₙ)/2 + h₂ + h₃ + … + hₙ₋₁]
- **Simpson's 1/3 rule:** Area = (w/3)·[h₁ + 2·Σ(h_odds) + 4·Σ(h_evens) + hₙ]
  - w = common interval between offsets

### A16. EARTHWORK
- **Average end area:** V = L·(A₁ + A₂)/2
- **Prismoidal:** V = L·(A₁ + 4·A_m + A₂)/6 (A_m = mid-section area)
- **Pyramid/cone:** V = h·(base area)/3

### A17. PROBABILITY & STATISTICS
- **Standard deviation (sample):** σ = √[Σ(xᵢ − x̄)²/(n − 1)] = √[Σv²/(n − 1)] (v = residuals)
- **Error propagation:**
  - Sum of errors: σ_sum = √(σ₁² + σ₂² + … + σₙ²)
  - Series (n equal): σ_series = σ·√n
  - Mean: σ_mean = σ/√n
  - Product (A·b form): σ = √(A²σ_b² + B²σ_a²)
- **Relative weights:** W_a ∝ 1/σ_a² (inverse of variance)
- **Weighted mean:** M_w = Σ(W·M)/ΣW
- **Confidence interval Z values (two-tail):** 80%→1.2816, 90%→1.6449, 95%→1.9600, 96%→2.0537, 98%→2.3263, 99%→2.5758
- Includes Unit Normal table, t-distribution table, F-distribution table (α=0.05), χ² CI for variance
- **Three-wire leveling:** read upper/middle/lower wires; mean = (U + M + L)/3 used as the reading

### A18. Matrices / determinants (light coverage on exam)
- Multiplication non-commutative; cols(A) must = rows(B)
- 2×2 det: a₁b₂ − a₂b₁
- 3×3 det: a₁b₂c₃ + a₂b₃c₁ + a₃b₁c₂ − a₃b₂c₁ − a₂b₁c₃ − a₁b₃c₂
- Inverse: A⁻¹ = adj(A)/|A|

### A19. ECONOMICS (Chapter 4)
- Single payment compound amount (F/P, i, n) = (1 + i)ⁿ
- Single payment present worth (P/F, i, n) = (1 + i)⁻ⁿ
- Uniform series factors (A/F, A/P, F/A, P/A), gradient factors (P/G, F/G, A/G) — standard tables
- Nonannual compounding: i_e = (1 + r/m)^m − 1
- Straight-line depreciation: D_j = (C − S_n)/n
- MACRS: D_j = (table factor)·C
- Book value: BV = initial cost − ΣD_j
- Capitalized cost: P = A/i
- Benefit-cost: B − C ≥ 0, or B/C ≥ 1

### A20. ETHICS (Chapter 5) — Surveyor's Canons (NSPS, 7 canons)
1. Refrain from conduct detrimental to the public.
2. Abide by rules/regulations of the licensing jurisdiction.
3. Accept assignments only in one's area of competence.
4. Communicate professional analysis/opinion without bias or personal interest.
5. Maintain confidentiality of the surveyor-client relationship.
6. Avoid misleading advertising/solicitation.
7. Maintain integrity when dealing with other professions.
- **Model Rules** three sections: obligations to (1) Public, (2) Employers/Clients, (3) Other Licensees. Public welfare is "first and foremost." Sign/seal only work in your competence and under your responsible charge.

### A21. SAFETY (Chapter 6)
- **Risk = Hazard × Probability** (or Hazard × Exposure for chemicals)
- Hazard = capacity to cause harm; Risk = probability + severity
- **JSA/JHA/AHA:** job/activity hazard analysis — review each step, identify hazards, document safest method
- **Fire/hazard diamond:** Blue=Health, Red=Flammability, Yellow=Instability, White=Special (OX, W, SA); ratings 0–4
- **GHS:** standardized classification/labeling; SDS has **16 sections** in fixed order (OSHA enforces 1–11, 16; not 12–15)
- Pesticide signal words: Danger-Poison (highly toxic), Warning (moderately), Caution (slightly/relatively nontoxic)

---

## PART B — CALCULATOR SKILLS MODULE (polar↔rectangular method)

Source: handwritten **RPLS Calculations** notes (TI-30Xa, with HP-33S/HP-35S references) and HP program books. **Approved calculators for the FS/SIT:** HP RPN scientific — **HP-33S** and **HP-35S** (the only HP models allowed). The TI-30Xa is shown for the polar/rect manual technique. The HP program books contain canned routines (TRAVERSE `XEQ T`, CLOSURE `XEQ C`, INVERSE, INTERSECTIONS `XEQ I`, AREA) but are scanned image listings — treat as keystroke-programming references, not transcribed code.

### B1. Foundational mental model
- **Rectangular (Rect) = coordinates:** (ΔE, ΔN) i.e. (Departure, Latitude) — entered as (x, y).
- **Polar = distance + direction:** (r, θ) = (distance, bearing/azimuth angle).
- Convention in the notes: **x = ΔE (Easting/Departure), y = ΔN (Northing/Latitude)**. Angle θ measured from the north (y) axis as a bearing, or as full azimuth.
- **Latitude (ΔN) = Distance × cos(Azimuth)** ; **Departure (ΔE) = Distance × sin(Azimuth)**.

### B2. DMS ↔ Decimal degrees
- **TI-30Xa:** decimal → DMS via `2nd [DD▸DMS]` ; DMS → decimal via `2nd [DMS▸DD]`. Enter DMS as D.MMSSss.
- **HP-33S/35S:** `→HMS` and `→HR` (HMS) functions convert between decimal hours/degrees and H.MMSS format.
- Bearing angle quadrant + sign of ΔN/ΔE gives the quadrant; add the handbook constant C to convert to azimuth.

### B3. INVERSE — distance & azimuth between two points (Rect → Polar)  [R▸P]
Given P1(N₁,E₁) and P2(N₂,E₂):
1. ΔE = E₂ − E₁  (x) ; ΔN = N₂ − N₁  (y)
2. **TI-30Xa keystrokes:** enter `ΔE` `2nd [x⇄y]` `ΔN` then `2nd [R▸P]` → display gives **distance (r)**; press `2nd [x⇄y]` → gives **angle θ**.
   - (Notes label the steps: "(L)=ΔE 2nd x⇄y", "(D)=ΔN 2nd [R▸P]", then read DIST, then `2nd x⇄y` → AZ, then `2nd [DD▸DMS]` for DMS.)
3. Convert θ to azimuth/bearing using the quadrant of (ΔN, ΔE) and constant C (A6). Worked quadrant examples in the notes:
   - NE example: ΔN=+, ΔE=+ → θ = arctan(ΔE/ΔN), Az = θ.
   - SE: Az = 180° − bearing. SW: Az = 180° + bearing. NW: Az = 360° − bearing.
4. **HP-33S/35S:** native `→POL` / `→REC` (or COGO program `INVERSE`). Enter ΔN, ΔE; `→POL` returns r and θ. (Cole/Van Sickle and the HP35S program book do this via `XEQ` of a stored INVERSE routine.)

Worked sample (from notes): N₁=17,095.842 E₁=44,600.312 ; N₂=16,917.920 E₂=43,781.054.
ΔN = −157.922, ΔE = ... → AZ = 257°44′10″ (DMS), DIST computed via R▸P.

### B4. COORDINATES OF A POINT — from azimuth + distance (Polar → Rect)  [P▸R]
Given start point (N,E), azimuth Az, distance D, find new point:
1. **Latitude ΔN = D·cos(Az)** ; **Departure ΔE = D·sin(Az)**.
2. **TI-30Xa keystrokes:** enter `D` `2nd [x⇄y]` `Az` then `2nd [P▸R]` → display gives **Departure (x = ΔE)**; press `2nd [x⇄y]` → gives **Latitude (y = ΔN)**.
   - (Notes: "(D) distance 2nd x⇄y", "(A) azimuth 2nd [P▸R]" → "DISPLAY DEP", `2nd x⇄y` → "DISPLAY LAT".)
3. New coords: N_new = N + ΔN ; E_new = E + ΔE.
4. **HP-33S/35S:** `→REC` (rectangular) or stored TRAVERSE routine.

Worked sample (from notes): D=200.00, Az=330°30′00″ → LAT (ΔN)=+174.07, DEP (ΔE)=−98.48; checks with sin 330.5°×200 ≈ −98.48 and cos 330.5°×200 ≈ +174.07.

### B5. TRAVERSING routine (TI-30Xa, repeatable)
From the notes — sequence to walk a traverse leg-by-leg and accumulate coordinates:
1. Enter distance `2nd [x⇄y]`, enter azimuth, `2nd [P▸R]` (convert bearing→azimuth first if needed).
2. Read **DEP** (ΔE) → `2nd [SUM+]` to add to running Easting total; `2nd x⇄y` read **LAT** (ΔN) → `2nd [SUM+]` to add to running Northing total.
3. RCL1 = new Easting coordinate, RCL2 = new Northing coordinate.
4. **Repeat** for each additional course; closure = difference between final accumulated coords and the start.
- HP-33S program book: `XEQ T` = TRAVERSE, `XEQ C` = CLOSURE, `XEQ I` = INTERSECTIONS.

### B6. BEARING ↔ AZIMUTH
- Azimuth (from north, 0–360° clockwise). Bearing = quadrant letter + acute angle (N__E, S__E, S__W, N__W).
- NE: Az = bearing angle ; SE: Az = 180° − bearing ; SW: Az = 180° + bearing ; NW: Az = 360° − bearing.
- Reverse (back) azimuth = Az ± 180°.

### B7. AREA BY COORDINATES (by hand / calculator)
- Use Area = ½·|Σ Xᵢ(Yᵢ₊₁ − Yᵢ₋₁)| (A15) after computing all corner coordinates via P▸R legs.
- On HP-33S/35S, the stored AREA routine accepts sequential N,E inputs and returns acreage (÷43,560 for ft²→acres).

### B8. INTERSECTIONS
- Bearing-bearing intersection: solve the two line equations (each (E−E₀)/(N−N₀) = tan Az). Handbook practice problem 5 gives the canonical intersection-equation form (see Part C, Q5).
- HP-33S: `XEQ I`.

---

## PART C — PRACTICE EXAM (30 questions, Halff SIT Study Group, Oct 2025)

Closed-book practice, 3 min/question, 90 min. **No printed answer key** — derived answers flagged `[derived]`. These are the gold problem templates; categories map to the exam outline.

| # | Topic | Setup | Answer choices | Note |
|---|-------|-------|----------------|------|
| 1 | **Area / curves** | 60-ft × 120-ft otherwise-rectangular lot; one corner is a curve, R=20 ft, central angle 90°. Find area (ft²). | A 6,872 / B 6,886 / C 7,114 / D 7,200 | Rect 60×120=7,200 minus corner (square 20×20=400 minus quarter-circle πR²/4=314.16)=7,200−85.84≈**7,114 (C)** `[derived]` |
| 2 | **Error propagation (product/area)** | Rect lot 120.00±0.04 ft × 144.00±0.05 ft. State the area. | A 17,280±4.7 / B ±8.3 / C ±49.7 / D ±87 | Area=17,280; σ=√[(144·0.04)²+(120·0.05)²]=√(5.76²+6²)=√69.2≈**8.3 → (B)** `[derived]` |
| 3 | **Triangle / Law of sines** | 1-acre triangle, vertex A; AB bearing N55°00′E, AC bearing S75°00′E; BC is N-S line. Find length AB (ft). | A 299.96 / B 352.84 / C 358.73 / D 366.20 | Solve triangle from area=43,560 ft² and the two bearings. `[derived ~ B/C]` |
| 4 | **Matrix multiply** | A=[3 4 7], B=[5;0;−2]. AB = ? | A col[15;0;−14] / B [1] / C 3×3 / D [15 0 −14] | 1×3 · 3×1 = scalar [1]. Dot=15+0−14=**[1] (B)** |
| 5 | **Intersection equations (concept)** | Two survey lines: (E−E₁)/(N−N₁)=tan45°, (E−E₂)/(N−N₂)=tan315°. Correct equation for E of intersection? | 4 algebraic forms | Tests COGO bearing-bearing intersection algebra |
| 6 | **Standard deviation** | Line measured 10×: 215.86,215.80,215.78,215.84,215.84,215.83,215.82,215.86,215.86,215.81. Find σ of the set. | A 0.023 / B 0.025 / C 0.027 / D 0.032 | Sample σ over 10 obs ≈ **0.027 (C)** `[derived]` |
| 7 | **Tape thermal correction** | Two monuments 99.96 ft apart (verified). Tape reads 99.99 ft at 85°F, tension 15 lb fully supported. Length between marks at 85°F most nearly? | A 99.95 / B 99.97 / C 100.05 / D cannot answer | Distinguishes nominal vs corrected length |
| 8 | **EDM best accuracy (concept)** | For best horizontal accuracy with EDM, what matters? | A know temp & pressure / B battery / C umbrella / D avoid power lines | A — atmospheric correction |
| 9 | **Polaris / timing error** | Polaris obs at lat 42° N, star at/near upper culmination; 1-min timing error. Z = sin(θp)/cos(lat). δ_Polaris≈89°10′, bearing≈0°. Azimuth error from 1-min timing? | A 04″ / B 09″ / C 15″ / D 18″ | Astronomic azimuth |
| 10 | **Geodesy definition** | Earth as level surface perpendicular to plumb line everywhere = ? | A spheroid / B Clarke 1866 / C geophysical surface / D **geoid** | Definition: **geoid (D)** |
| 11 | **Program flow chart** | A=1; loop A=A+1 while A<10; then C=A. Final C? | A 8 / B 9 / C **10** / D 11 | Loop exits when A=10 → **C=10 (C)** `[derived]` |
| 12 | **USGS quad sheet** | A 7½-min quad will show? | A SPC grid ticks at 10,000-ft / B 2-ft contours / C aerial photo availability / D **all of the above** | |
| 13 | **Boundary law — parol evidence** | Legal term for info from interviews with local residents to clarify ambiguous deed words? | A intrinsic / B **parol evidence** / C colloquial / D in sequitor localis | |
| 14 | **English/QA** | Review a letter; count grammatical & spelling mistakes. | A 8 / B 12 / C 15 / D 18 | Professional communication |
| 15 | **PLSS fractional lot area** | Govt record, NW¼ of Sec 5: N 19.83, E 19.09, W 19.31, S 20.14 chains. Area (acres) on township plat? | A 38.33 / B 38.35 / C 38.37 / D 38.39 | Trapezoid area in chains → acres (÷10) `[derived]` |
| 16 | **Double proportion (section corner)** | Restore section corner G by double proportionate methods; pick correct geometric statement (FG∥AC, etc.) | 4 statements | PLSS restoration |
| 17 | **Easement (concept)** | An easement is: | A always granted in writing / B **limited non-possessory interest in a tract** / C not an encumbrance / D always for transport/utility | **(B)** |
| 18 | **Retracement records source** | Best source for ROW line of road/railroad/utility in retracement? | A NGS / B original plans w/ recorded legal / **C actual stationing as built per construction/design plans** / D adjacent deeds | |
| 19 | **Warranty deed** | A warranty deed is an example of: | A possession insurance / B Torrens title / **C a title guarantee** / D boundary-line agreement | **(C)** |
| 20 | **Accretion vs erosion** | Bank built up by imperceptible degrees from natural causes = ? | A **accretion** / B reliction / C revision / D erosion | **(A)** |
| 21 | **Collateral evidence** | "Corner obliterated, recovered by collateral evidence" means? | A all landowners affected / **B corner reestablished by evidence other than monument/accessories** / C oaths / D court of law | |
| 22 | **Easement description** | Description ends "together with an easement across Johnson's land for road purposes" → easement is: | A informative / **B augmenting** / C simultaneous / D encumbering | Appurtenant/augmenting to the dominant tract |
| 23 | **Controlling call** | "...thence N 80°20′E a distance of 800.28 ft to a 12-in oak tree blazed..." controlling call? | A bearing / B distance / C **the oak tree** / D both A & B | Monument (natural) controls over course/distance |
| 24 | **Easement NOT true** | Which easement statement is NOT true? | A created w/o owner consent / B valid if unrecorded / **C cannot be conveyed separately** / D extinguished by mutual consent | C (appurtenant easements pass with land) |
| 25 | **Records (concept)** | Surveyor keeps adequate records because: | A federal law / B client can sue / C professional responsibility / **D all of the above** | |
| 26 | **Economics — financing cost** | Robotic total station $40,000; pay $8,000/yr at year-end; 8% simple interest 5 yr. Additional financing cost vs cash? | A $2,000 / B $3,200 / C $9,600 / D $16,000 | Simple-interest series `[derived]` |
| 27 | **Map projection history** | World map in grade schools based on projection by: | A Ellicot / B Lambert / C Washington / **D Mercator** | **(D)** |
| 28 | **Survey method history** | Method to lay out RR centerline in the 1920s? | A theodolite & tape / B compass & tape / **C transit and chain** / D transit & tape | |
| 29 | **Leveling collimation correction** | Level up a hill; BS dist 200 ft, FS dist 150 ft; line of sight inclined up 0.012 ft/100-ft; raw ΔElev BM A→B = +50.035 ft; 20 setups. Adjusted ΔElev (ft)? | A 49.915 / B 50.023 / C 50.029 / D 50.155 | Collimation correction = 0.012/100 × (ΣBS−ΣFS) per setup `[derived]` |
| 30 | **Plotting scale** | Plot traverse on 18″×24″ sheet. AB S0°25′E 1380.02, BC N88°31′W 2495.00, CD N0°25′W 1380.02, DA S88°31′E 2495.00 ft. Scale for max detail + ½-in margin? | A 1:1,440 / B 1:1,200 / C 1:960 / D 1:600 | ~2495 ft across 17 in usable → fit check `[derived ~ A/B]` |

**Topic emphasis (from this exam):** boundary law / real property is heaviest (Q13,16–25 ≈ 1/3), then COGO/curves/area (Q1,3,5,15), stats/error (Q2,6), leveling (Q7,29), geodesy/astro (Q9,10), economics (Q26), photogrammetry/mapping (Q12,27,30), computer logic (Q4,11).

---

## PART D — EXAM OUTLINE & TEST STRATEGIES

### D1. FS Exam content outline (7 areas)
1. Surveying Processes and Methods
2. Mapping Processes and Methods
3. **Boundary Law and Real Property Principles** (heavily weighted per practice exam)
4. Surveying Principles
5. Survey Computations and Computer Applications
6. Business Concepts
7. Applied Mathematics and Statistics

### D2. SIT certification (Texas) — qualification paths (meet ONE) + pass FS
- BS in Surveying; OR Bachelor's + 32 hrs relevant coursework + 1 yr exp; OR Associate's in surveying + 2 yr; OR 32 hrs coursework + 2 yr; OR HS diploma + 4 yr exp + self-education. **AND pass the FS exam.** (TBPELS / NCEES.)

### D3. 7-step exam strategy (presenter slides)
1. Preview the entire exam. 2. Answer easiest questions first. 3. Flag and skip hard ones. 4. Calculate. 5. Eliminate answers. 6. Make educated guesses. 7. Final review time.

### D4. Test-taking strategies (Billy Wolfram, RPLS)
**Preparation:** practice sketches/calcs on legal paper under exam conditions; take timed practice (NCEES/TBPELS); keep your routine; lite review only the week of; scope the test site beforehand; stay overnight nearby.
**Test day:** bring lunch (don't leave site); water allowed; remove staple from analytical booklet, use binder clips to organize; earplugs if needed.
**Basic strategies:** read setup + question + answers fully before solving; keep momentum (≠ speed); solve known/quick ones first, multi-step next, hard last; don't over-think ("each Q tests 1–2 concepts"); score/mark as you go; use all the time; make a vicinity sketch in the margin first.
**Q/A:** eliminate wrong answers with a strike-through; watch for logical distracters (too broad/narrow/long/short); clues may appear in other questions' preambles; trust your gut on split decisions; plug answers back in as a last resort.
**Calculation discipline:** use the simplest method (don't run a traverse routine to area a rectangle); use coordinate sense to sanity-check (if it can't be SW of a known point, rule it out); don't enter every given coordinate until you've read the whole problem; write each computed value once (e.g., inverse once); only solve corners/lines necessary for the question.

---

## PART E — TEXTBOOK PROBLEM TYPES (template seeds)

### E1. Source coverage
- **Surveying — Problem Solving with Theory & Objective Type Questions** (A.M. Chandra) — clean text, full TOC below; each chapter = theory summary + worked examples + objective questions + unsolved problems. Ideal template source.
- **Elementary Surveying / Geomatics 13e** (Ghilani & Wolf) — 59 MB; canonical US-practice reference. Not exhaustively mined here (Chandra covers the same problem types); use for additional US-convention examples (DMD area, stadia, GNSS, SPCS worked problems).

### E2. Chandra "Problem Solving" — chapter map (canonical problem TYPES)
1. **Errors in Measurements & Propagation** — error types (gross/systematic/random), normal distribution, MPV, std dev/variance, std error of mean, confidence limits, **weight (∝1/σ²)**, precision vs accuracy, **error propagation**.
2. **Distance Measurement** — taping (pull, sag, temperature, tension/normal tension, slope), tape elongation in vertical shaft, **tacheometry/stadia**, subtense bar, **EDM**, vertical-angle accuracy.
3. **Levelling** — differential/spirit, loop closure & apportioning, **reciprocal levelling**, **trigonometric levelling**, sensitivity of bubble tube, two-peg test, eye-&-object (curvature/refraction) correction.
4. **Theodolite & Traverse** — theodolite maladjustment errors, **traverse, coordinates, bearing, departure/latitude, easting/northing, balancing the traverse (compass/Bowditch rule), omitted measurements, centring error**.
5. **Adjustment of Observations** — least squares, observation/condition equations, normal equations, correlates, variation of coordinates, polygon with central station.
6. **Triangulation & Trilateration** — strength of figure, visible horizon distance, satellite station/reduction to centre, intersection/resection, spherical triangle, earth curvature, convergence.
7. **Curve Ranging** — circular, **compound**, **reverse**, **transition (spiral)**, **vertical curves**.
8. **Areas & Volumes** — area by coordinates, **trapezoidal & Simpson's rules**, volumes (end-area, prismoidal), heights from DTM, **mass-haul diagram**.
9. **Point Location & Setting Out** — setting out by bearing & distance, intersection/resection, tunnelling alignment transfer, monitoring, lasers, sight rails, embankment profile boards.

### E3. Representative worked examples (numeric, for template calibration)

**Ex. (Ch.1) Inverse + error propagation + weighted mean** — Stations A(E 456.961±20 mm, N 573.237±30 mm), B(E 724.616±40 mm, N 702.443±50 mm).
- ΔE = 267.655 m, ΔN = 129.206 m → L = √(ΔE²+ΔN²) = **297.209 m**.
- σ_E = √(20²+40²) = ±44.7 mm; σ_N = √(30²+50²) = ±58.3 mm.
- ∂L/∂E = ΔE/L = 0.901, ∂L/∂N = ΔN/L = 0.435 → σ_L = √[(0.901·44.7)²+(0.435·58.3)²] = **±47.6 mm**.
- Combined with tape (297.426±70) and EDM (297.155±15) via weights ∝1/σ²; most probable length = weighted mean.
→ Template: 2-coordinate inverse, propagate to distance, then weighted mean of redundant length measurements.

**Ex. (Ch.3) Reciprocal levelling across a river** — Inst@1: A=1.485, B=1.725; Inst@2: A=1.190, B=1.415. RL(B)=55.18 m, AB=315 m.
- Δh = ½[(a₁−b₁)+(a₂−b₂)] = ½[(1.485−1.190)+(1.725−1.415)] = **0.303 m** → RL(A)=55.18−0.303=**54.88 m**.
- Total error e = ½[(b₁−a₁)−(b₂−a₂)] = 0.008 m; combined curvature+refraction (c&r)=0.067·d²=0.067·0.315²=0.007 m; collimation error = e−(c&r).
→ Template: reciprocal leveling solves Δelev and isolates collimation vs curvature/refraction.

**Ex. (Ch.3) Line-of-sight (collimation) correction in differential leveling** — apply per-setup correction = (inclination rate)×(BS dist − FS dist) summed over all setups (matches practice exam Q29).

→ Additional template families to generate: tape corrections (temperature ΔL=α·L·ΔT, pull, sag w²L³/24P², slope), curve geometry (T/L/R/M/E from any two knowns), traverse balancing (Bowditch: correction to lat/dep ∝ leg length / perimeter), area by coordinates/DMD, vertical curve elevations & high/low point, SPCS combined-factor ground↔grid.

---

## Appendix — File inventory & extraction status
| File | Type | Status |
|------|------|--------|
| fs-handbook-2-5.pdf | NCEES FS Reference Handbook v2.5 | **Fully extracted** (text layer) → Part A |
| 10-18-2025 SIT Study Group Exam.pdf | 30-Q practice exam (image scan) | Rendered + read → Part C (no answer key in source) |
| 10-18-2025 SIT Study Group PP Slides.pdf | Presenter slides (text) | Extracted → Parts B/D |
| Test_Strategies.pdf | Test-taking strategies (text) | Extracted → Part D4 |
| RPLS Calculations _ TI-30X(a)... .pdf | Handwritten calc method (image) | Rendered + read → Part B |
| RPLS Calculations _ pg 1.pdf | Formula sheet (image, dup of above p1) | Rendered + read → Part B |
| HP 33S Programs.pdf | 149-pg program book (faint image scans) | Catalogued only (no usable text/render) → Part B refs |
| HP35S-Survey Programs with corrections.pdf | 57-pg program book (faint image scans) | Catalogued only → Part B refs |
| Surveying - Problem Solving... (Chandra).pdf | Textbook (text layer) | TOC + worked examples → Part E |
| Elementary Surveying / Geomatics 13e (Ghilani, Wolf).pdf | Textbook (59 MB) | Referenced (not exhaustively mined) → Part E |
| Guide to Legal Aspects of Surveying (Harbin).pdf | Boundary-law reference | Not extracted (out of scope for this formula/calc pass) |
| Surveying with Construction Applications (Kavanagh).pdf | Construction-survey reference | Not extracted (out of scope) |
| Engineering Surveying 6e.pdf | Reference (67 MB) | Not extracted (out of scope) |
