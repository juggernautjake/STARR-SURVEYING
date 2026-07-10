# FS Exam Practice — Full Question & Answer Record

Source: NCEES BenchPrep FS Exam (Fundamentals of Surveying), 50-question full-length practice test.
Captured with "Review Answer" ON, so correct answers + explanations appear after each submission.
My answer = the answer Claude selected and submitted. Result = how BenchPrep graded it.

---

## Q1 — Differential leveling / curvature & refraction
**Question:** What effects must be taken into consideration when performing differential leveling over long distances? (Select the two that apply.)

- A. Focal length of the instrument
- B. Curvature of the earth
- C. Latitude of the observations
- D. Atmospheric refraction
- E. Latitude of observer

**My answer:** B, D
**Correct answer:** B, D
**Result:** ✅ CORRECT
**Explanation:** The curvature of the earth and atmospheric refraction both affect the path of light over distance.
**Category:** Leveling / geodesy

---

## Q2 — GNSS most important measurement
**Question:** What is the most important measurement in Global Navigation Satellite System (GNSS) survey procedures?

- A. Barometric pressure
- B. Relative humidity
- C. Antenna height
- D. Distance between base and rover

**My answer:** C
**Correct answer:** C
**Result:** ✅ CORRECT
**Explanation:** The height of the antenna is a critical measurement as the solution to the position requires the true position of the antenna relative to the center of the earth.
**Category:** GNSS / GPS

---

## Q3 — GNSS elevations limiting factor
**Question:** When elevations are produced for a survey project using GNSS, the limiting factor is a:

- A. clear line of sight
- B. precise ellipsoid model
- C. precise geoid model
- D. precise gravimetric model

**My answer:** C
**Correct answer:** C
**Result:** ✅ CORRECT
**Explanation:** GNSS provides ellipsoidal heights (relative to a mathematical ellipsoid). To convert to orthometric heights (relative to the geoid ≈ mean sea level), a geoid model is needed. A precise geoid model is crucial when using GNSS for elevation surveys.
**Category:** GNSS / geodesy — height systems

---

## Q4 — Geodetic heights reference
**Question:** Geodetic heights obtained with satellite surveys are:

- A. presented in geocentric coordinates
- B. presented in state plane coordinates
- C. measured with respect to the geoid
- D. measured with respect to the ellipsoid

**My answer:** D
**Correct answer:** D
**Result:** ✅ CORRECT
**Explanation:** Geodesists use a reference ellipsoid to model the earth's surface. GPS/GNSS satellites orbit the center of mass of the earth and provide measurements referenced to the ellipsoid (geodetic/ellipsoidal height).
**Category:** GNSS / geodesy — height systems

---

## Q5 — Survey type to link infrastructure
**Question:** The most effective way to link the proposed infrastructure of a development to the existing adjacent infrastructure is determined by a:

- A. boundary survey
- B. topographic survey
- C. control survey
- D. geodetic survey

**My answer:** C (control survey)
**Correct answer:** B (topographic survey)
**Result:** ❌ INCORRECT
**Explanation:** Topographical surveys show natural terrain features as well as man-made features such as roads and sanitary/storm drain systems — so they are what links proposed infrastructure to existing adjacent infrastructure.
**Note of interest:** Tricky wording — "link to existing adjacent infrastructure" points to a topo survey (capturing existing features), not a control survey. Good exam-trap candidate for the prep course.
**Category:** Types of surveys

---

## Q6 — Sewer grade revision / cut computation  [HAS FIGURE]
**Question:** A survey party has set offset stakes for construction of an 8-in. sewer shown in the design plan. When the existing 12-in. sewer line is uncovered for the construction of Manhole (MH) 1, it is found that the actual flow line elevation is 1,228.69 ft rather than the design elevation of 1,228.47 ft. The gradient must be revised, holding the flow line elevation of 1,229.27 ft at MH 2. If the elevation of the grade stake at Sta. 1+25 is 1,235.06 ft, the cut (ft) to the flow line marked on the stake at this station is most nearly:

**Figure (profile, not to scale):** MH 1 over existing 12" sewer at Sta 0+00, design flow line elev 1,228.47; 8" sewer at +0.325% (design) running to MH 2 at Sta 2+47.55, flow line elev 1,229.27.

- A. 5.98
- B. 6.08
- C. 6.18
- D. 6.25

**My answer:** B
**Correct answer:** B
**Result:** ✅ CORRECT
**Solution:**
1. Revised gradient = (1,229.27 − 1,228.69)/247.55 = 0.00234 ft/ft
2. Flow line elev at Sta 1+25 = 1,228.69 + (125)(0.00234) = 1,228.98 ft
3. Cut = 1,235.06 − 1,228.98 = **6.08 ft**
**Category:** Construction staking / grade & cut computations

---

## Q7 — Slope stake trial position  [HAS FIGURE]
**Question:** You are setting slope stakes along the roads within a subdivision. Typical cut and fill sections are shown. At Sta. 2+00 the finish grade elevation is 110.31 ft at the edge of the road, and the distance from the centerline to the edge of the road is 12.0 ft. The rod is being held at a distance of 28.5 ft from the centerline, and the rod reading is 12.1 ft while the H.I. is 119.77 ft. Your next step is to:

**Figure:** Typical FILL section = 4:1 side slope from edge of road; typical CUT section = 2:1 then 3:1 (with 3'-0" depth). Not to scale.

- A. move in about 6 ft and try again
- B. move in about 10 ft and try again
- C. move out about 6 ft and try again
- D. drive in a stake since you are at the slope stake

**My answer:** A
**Correct answer:** A
**Result:** ✅ CORRECT
**Solution:**
1. Ground elev = HI − rod = 119.77 − 12.1 = 107.67 ft
2. Road edge is above ground by 110.31 − 107.67 = 2.64 ft → section is in FILL → use 4:1 slope
3. Move 2.64 × 4 = 10.56 ft beyond road edge → catch point at 12.0 + 10.56 = 22.56 ft from CL
4. Rod at 28.5 ft → move IN 28.50 − 22.56 ≈ **6 ft**
**Category:** Construction staking / slope staking

---

## Q8 — Flood insurance document
**Question:** Which document is typically used to rate structures located in or near a floodplain for the purpose of flood insurance?

- A. Elevation Form
- B. Wetlands Evaluation
- C. Floodproofing Certificate
- D. Elevation Certificate

**My answer:** D
**Correct answer:** D
**Result:** ✅ CORRECT
**Explanation:** The FEMA Elevation Certificate is an administrative tool of the National Flood Insurance Program (NFIP). It provides elevation info to ensure compliance with floodplain ordinances, determine insurance premium rates, and support a Letter of Map Amendment/Revision (LOMA/LOMR).
**Category:** Floodplain / FEMA / boundary-law adjacent

---

## Q9 — Highest contour elevation  [HAS FIGURE — contour map] [NUMERIC ENTRY]
**Question:** The elevation (ft) of the highest contour line on the map shown is _____. (Enter your response in the box.)

**Figure:** Topographic contour map with index contours labeled 1,000 and 1,500 ft; a hill on the right with a closed 1,500-ft contour and higher inner contours.

**My answer:** 1800
**Correct answer:** 1800
**Result:** ✅ CORRECT
**Solution:** Counting contours between 1,000 and 1,500 → contour interval = 100 ft. The hill has a closed 1,500-ft contour with three higher contours inside → highest = **1,800 ft**.
**Category:** Topographic mapping / contours

---

## Q10 — Aerial photograph scale
**Question:** On a vertical aerial photograph, a bridge measures 6.75 in. On a map that has a scale of 1:12,000, the same bridge measures 8.10 in. At the bridge site, the aerial photograph scale is most nearly:

- A. 1/833
- B. 1/1,200
- C. 1/10,000
- D. 1/14,400

**My answer:** D
**Correct answer:** D
**Result:** ✅ CORRECT
**Solution:** Ground distance = (8.10/12) × 12,000 = 8,100 ft. Photo scale = (6.75/12) / 8,100 = **1/14,400**.
**Category:** Photogrammetry / scale

---

## Q11 — GIS topology
**Question:** Which of the following is not related to topology in a GIS?

- A. Connectivity
- B. Adjacency
- C. Polygon
- D. Color

**My answer:** D
**Correct answer:** D
**Result:** ✅ CORRECT
**Explanation:** Topology is the geometric relationship of one spatial object to another (connectivity, adjacency, containment/polygons). Color does not apply to topological relationships.
**Category:** GIS / topology

---

## Q12 — NSSDA vertical accuracy multiplier  [NUMERIC ENTRY]
**Question:** To compute the vertical accuracy of a data file containing elevation data using the National Standard for Spatial Data Accuracy (NSSDA), the root mean square error (RMSE) is multiplied by _____.

**My answer:** 1.96
**Correct answer:** 1.9600
**Result:** ✅ CORRECT
**Explanation:** Per Section F of NSPS Model Standards, the NSSDA statistic multiplies RMSE by the standard error of the mean at the 95% confidence level: **1.7308 for horizontal** accuracy and **1.9600 for vertical** accuracy.
**Note of interest:** Memorize BOTH NSSDA multipliers — horizontal 1.7308, vertical 1.9600. High-value fact for the prep course.
**Category:** Spatial data accuracy standards (NSSDA)

---

## Q13 — Label the nadir / tilted-photo diagram  [HAS FIGURE] [DRAG-AND-DROP]
**Question:** Label the following nadir diagram. Drag each term to the correct location on the figure.
Terms: Optical axis, Plumb line, Principal line, Tilted photo.

**My answer / Correct answer (matched):**
- **Plumb line** → the vertical line dropping straight to NADIR (from exposure station to nadir point)
- **Optical axis** → the tilted straight line through the photo/principal point (perpendicular to the photo plane at the lens)
- **Tilted photo** → the parallelogram (the photo plane)
- **Principal line** → the line in the photo plane through the principal point and photo nadir point (through the two dots)

**Result:** ✅ CORRECT (all four placed correctly)
**Category:** Photogrammetry / tilted photograph geometry

---

## Q14 — Average photo scale from flight height
**Question:** An airplane carrying a camera with a 6-in. focal length is flying at 10,000 ft above mean sea level. If the average terrain is 1,500 ft above mean sea level, the average scale of the photo is most nearly:

- A. 1:16,000
- B. 1:17,000
- C. 1:18,000
- D. 1:20,000

**My answer:** B
**Correct answer:** B
**Result:** ✅ CORRECT
**Solution:** Scale = focal length / height above mean terrain = 6 in / [(10,000 − 1,500 ft) × 12 in/ft] = 6 / (8,500 × 12) = **1:17,000**.
**Category:** Photogrammetry / scale

---

## Q15 — LiDAR binary file format
**Question:** A binary public file format used to interchange three-dimensional light detection and ranging data is called:

- A. ASCI
- B. LAS
- C. USGS DEM
- D. TIFF

**My answer:** B
**Correct answer:** B
**Result:** ✅ CORRECT
**Explanation:** LAS is the binary public format for LiDAR. ASCII files are not binary; USGS DEM stores raster-based digital elevation models; TIFF is a tagged imagery file.
**Category:** LiDAR / data formats

---

## Q16 — Warranty deed
**Question:** A warranty deed is an example of:

- A. possession insurance
- B. a Torrens title
- C. a title guarantee
- D. an agreement between owners to fix a disputed boundary line

**My answer:** C
**Correct answer:** C
**Result:** ✅ CORRECT
**Explanation:** A warranty deed is a real-estate document in which the grantor guarantees clear title to the grantee (free from liens/claims) — the highest level of protection. It is a title guarantee.
**Category:** Boundary law / property transfer

---

## Q17 — Order title elements by importance  [DRAG-AND-DROP ORDERING]
**Question:** List the following title elements in order of importance from most important to least important. (Elements: Area, Called-for monument, Senior rights, Right of possession, Distance.)

**My answer (order):** Senior rights → Right of possession → Called-for monument → Distance → Area
**Correct answer (order):** **Right of possession → Senior rights → Called-for monument → Distance → Area**
**Result:** ❌ INCORRECT (I swapped the top two)
**Note of interest:** NCEES's key ranks **Right of possession as MOST important, ABOVE Senior rights** — a deviation from the classic Brown "senior rights first" hierarchy. Flag this for the prep course; it's a likely trap. The rest of the order (monument > distance > area) is standard priority-of-calls.
**Category:** Boundary law / priority of conflicting elements

---

## Q18 — Easement extinguishment
**Question:** Under which of the following circumstances would a road easement be extinguished?

- A. The servient tenement is sold to another.
- B. The dominant and servient tenement is under one ownership.
- C. The easement is not actively in use.
- D. A fence is constructed across the easement.

**My answer:** B
**Correct answer:** B
**Result:** ✅ CORRECT
**Explanation:** Merger of title between the dominant and servient tenement causes the easement to merge into fee ownership (extinguished by merger). Non-use alone or a fence does not extinguish it; sale of servient tenement leaves the easement intact.
**Category:** Boundary law / easements

---

## Q19 — Senior rights in a recorded subdivision  [HAS FIGURE — subdivision plat]
**Question:** The figure shows a portion of a recorded subdivision plat, plus locations of original monuments found and current survey measurements. Lot 22 was conveyed by the subdivider to Smith on June 7, 1979. Lot 23 was sold to the same person on June 8, 1979. It can be said that:

- A. Lots 22 and 23 have equal rights because the grantee is the same person.
- B. Lot 22 has senior rights to Lot 23 because it was platted first.
- C. Lot 22 has senior rights to Lot 23 because it was sold first.
- D. Lots 22 and 23 have equal rights within a recorded subdivision.

**My answer:** D
**Correct answer:** D
**Result:** ✅ CORRECT
**Explanation:** Standard principle of simultaneous conveyances — all lots in a recorded subdivision are created at the same instant (when the plat is recorded), so no lot is senior to another regardless of sale dates. Note the reason is the recorded subdivision, not the shared grantee (rules out A).
**Category:** Boundary law / senior rights & simultaneous conveyances

---

## Q20 — Remainder lot frontage  [HAS FIGURE — recorded plat]
**Question:** The figure shows a portion of a recorded plat. Original monuments A and B are found and measure 232.30 ft apart with no other lot corners found. The frontage (ft) of Lot 5 is most nearly:
**Figure:** Lots 1–4 each = 50.00 ft record frontage along First Street; Lot 5 = **30± ft** (remainder). Monuments A (before Lot 1) and B (after Lot 5).

- A. 30.0
- B. 30.30
- C. 32.30
- D. 33.20

**My answer:** C
**Correct answer:** C
**Result:** ✅ CORRECT
**Solution:** The "±" marks Lot 5 as the REMAINDER lot. Lots 1–4 hold record (4 × 50 = 200 ft). Lot 5 = 232.30 − 200 = **32.30 ft**.
**Note of interest:** Contrast with proportionate distribution (would give 30.30, option B). The "±" notation is the tell that the last lot absorbs excess/deficiency. Strong exam-trap teaching point.
**Category:** Boundary law / excess & deficiency (remainder vs proportionate)

---

## Q21 — Order the parts of a metes-and-bounds description  [DRAG-AND-DROP ORDERING]
**Question:** Place the following parts of metes and bounds legal descriptions in the correct order of appearance. (Terms: Qualifying clauses, Augmenting clauses, Caption or heading, Body.)

**My answer / Correct answer (matched):**
1. **Caption or heading**
2. **Body**
3. **Qualifying clauses**
4. **Augmenting clauses**

**Result:** ✅ CORRECT
**Category:** Legal descriptions / structure

---

## Q22 — Obliterated PLSS corner
**Question:** In a dependent resurvey in the Public Land Survey System (PLSS), corners are either existent, obliterated, or lost. An obliterated corner is one whose location can be determined by:

- A. double proportion
- B. single proportion
- C. reliable testimony
- D. secondary methods

**My answer:** C
**Correct answer:** C
**Result:** ✅ CORRECT
**Explanation:** Reliable testimony (and acceptable evidence) determines an OBLITERATED corner — one with no remaining monument traces but recoverable location. Double/single proportion and secondary methods are for LOST corners.
**Note of interest:** Key PLSS distinction — obliterated = recoverable by testimony/evidence; lost = must be re-established by proportionate measurement.
**Category:** PLSS / corner restoration (BLM Manual)

---

## Q23 — National Tidal Datum Epoch  [NUMERIC ENTRY]
**Question:** The standard determination of the principal tidal datums (e.g., mean high water, mean low water, mean higher high water) is determined in the United States based on the average observations of a period (full years) of _____.

**My answer:** 19
**Correct answer:** 19
**Result:** ✅ CORRECT
**Explanation:** Principal tidal datums in the U.S. are averaged over a 19-year period (the National Tidal Datum Epoch, NTDE).
**Category:** Riparian/tidal boundaries / tidal datums

---

## Q24 — Importance of county tax maps
**Question:** Which statement best describes the importance of parcel maps produced by county tax offices (tax maps)?

- A. They are official records of landownership.
- B. They do not have an official use; they are just advisory.
- C. They are an important form of parcel location evidence for a surveyor to follow.
- D. They only govern parcel identification for tax purposes.

**My answer:** D
**Correct answer:** D
**Result:** ✅ CORRECT
**Explanation:** Tax maps are drawings kept by the county for real-estate tax purposes; each parcel has a tax map ID. They are NOT dimensionally accurate and exist only to support parcel identification for tax collection — not authoritative boundary/ownership evidence (rules out C).
**Category:** Public records / tax maps

---

## Q25 — Purpose of reviewing deed recording dates
**Question:** When performing project research, it is necessary to review the historical recording dates of all deeds for the subject property and adjoining properties to determine:

- A. order of conveyance
- B. transcription errors
- C. the parties' intent
- D. the basis for declination

**My answer:** A
**Correct answer:** A
**Result:** ✅ CORRECT
**Explanation:** Creation and recording dates determine the order of conveyance — establishing senior rights and whether conveyances were sequential or simultaneous.
**Category:** Boundary law / research (senior rights)

---

## Q26 — Source of control monuments & coordinates
**Question:** The specifications for a survey require that the boundaries of a subdivision be referenced to the state plane coordinate system and that directions of the boundary lines be referenced to grid north. You can obtain a list of control monuments and coordinates from the:

- A. National Society of Professional Surveyors
- B. National Bureau of Standards
- C. National Geodetic Survey
- D. Bureau of Land Management

**My answer:** C
**Correct answer:** C
**Result:** ✅ CORRECT
**Explanation:** NOAA's National Geodetic Survey (NGS) provides the framework for all positioning activities in the U.S. — the source for control monuments and state plane coordinates.
**Category:** Geodesy / control networks (NGS)

---

## Q27 — Historical scale factor for resurvey
**Question:** Distance measurements made with modern equipment may not agree with historical measurements due to the type of equipment used and systematic errors in the original measurements. Which of the following allows surveyors to relate original record distances to measurements made during a resurvey, to assist with a resurvey, or to find the original monuments?

- A. Elevation factor
- B. Grid factor
- C. Scale factor
- D. Zone constant

**My answer:** C
**Correct answer:** C
**Result:** ✅ CORRECT
**Explanation:** A historical scale factor is found by measuring between two found, undisturbed original monuments and dividing the original (record) distance by the measured distance. Apply that factor to locate other original monuments.
**Category:** Retracement / scale factor (record vs measured)

---

## Q28 — Identify the geoid height  [HAS FIGURE — click hotspot]
**Question:** Click the geoid height on the elevation view shown.
**Figure:** Cross-section showing terrain surface, geoid, and ellipsoid with labeled segments: **h** = ellipsoidal height (ellipsoid→terrain), **H** = orthometric height (geoid→terrain), **N** = geoid height/undulation (ellipsoid→geoid), **r** = geocentric radius (ellipsoid→earth center).

**My answer:** clicked **N** (the segment between the ellipsoid and geoid)
**Correct answer:** N (geoid height)
**Result:** ✅ CORRECT
**Explanation:** Geoid height (geoid undulation) N is the separation between the ellipsoid and the geoid. Relationship: h = H + N.
**Category:** Geodesy / height systems (h = H + N)

---

## Q29 — Spherical triangle (law of cosines for sides)
**Question:** On a spherical triangle, a = 76°, b = 58°, C = 118°. The measurement for c is most nearly:

- A. 104°57'28"
- B. 59°14'19"
- C. 14°28'22"
- D. −14°57'28"

**My answer:** A
**Correct answer:** A
**Result:** ✅ CORRECT
**Solution:** cos c = cos a cos b + sin a sin b cos C = (0.241992)(0.529919) + (0.970296)(0.848048)(−0.469472) = 0.128199 − 0.386308 = −0.258109 → c = **104°57'28"**. (D is the invalid negative distractor.)
**Category:** Geodesy / spherical trigonometry

---

## Q30 — Lambert projection equal-distance lines
**Question:** In a Lambert projection, all the lines that are equal distance apart are:

- A. straight lines
- B. standard parallels
- C. central meridians
- D. meridians

**My answer:** D (meridians)
**Correct answer:** B (standard parallels)
**Result:** ❌ INCORRECT
**Explanation (as given):** "All meridians converge to a central point. Straight lines may be at different bearings." → by elimination the key gives standard parallels.
**Note of interest:** Ambiguous/poorly-worded item. Meridians in LCC are equally-spaced angularly but converge (not constant linear spacing). NCEES key = B. Flag as low-confidence; in LCC the parallels are concentric circular arcs. Worth reviewing for the prep course but note it's contentious.
**Category:** Map projections / Lambert Conformal Conic

---

## Q31 — Meaning of "projected" in SPCS
**Question:** The term projected as it relates to the State Plane Coordinate System means that the:

- A. survey is inaccurate and needs to be corrected
- B. survey points from found monuments need to undergo a unit conversion
- C. handwritten coordinates are entered into computer software
- D. earth's curvature needs to be taken into account for survey calculations

**My answer:** D
**Correct answer:** D
**Result:** ✅ CORRECT
**Explanation:** SPCS addresses earth's curvature by using map projections (Lambert conformal conic or transverse Mercator) to transform a portion of the curved earth surface onto a flat plane.
**Category:** State Plane Coordinate System

---

## Q32 — Order the traverse adjustment steps  [DRAG-AND-DROP ORDERING]
**Question:** When using the compass/transit rule process to complete a traverse adjustment, you must follow the steps in a certain sequence. Drag the steps into the correct order.

**My answer / Correct answer (matched):**
1. **Adjust the angles to fixed geometric conditions** (balance angles)
2. **Determine the azimuths of the traverse sides**
3. **Calculate departures and latitudes**
4. **Adjust the latitudes and departures for misclosure** (compass/transit rule)
5. **Calculate the lengths and azimuths of the traverse lines after adjustment**

**Result:** ✅ CORRECT
**Category:** Traverse computation & adjustment

---

## Q33 — Trigonometric leveling elevation
**Question:** A total station is set up 5.00 ft above a benchmark that has an elevation of 820.50 ft. A slope angle and slope distance of −3°15' and 645.90 ft, respectively, are measured to a reflector set up 4.25 ft above a hub at Point B. Ignore curvature and refraction. The elevation (ft) of the hub at Point B is most nearly:

- A. 785.76
- B. 784.63
- C. 783.88
- D. 779.63

**My answer:** B
**Correct answer:** B
**Result:** ✅ CORRECT
**Solution:** ELEV_B = 820.50 + 5.00 (HI) − 645.90·sin(3.25°) − 4.25 (rod) = 820.50 + 5.00 − 36.62 − 4.25 = **784.63 ft**.
**Category:** Trigonometric leveling

---

## Q34 — Error ellipses in least squares
**Question:** In least squares adjustments, error ellipses depict a two-dimensional representation of uncertainties of the:

- A. adjusted coordinates
- B. adjusted angles
- C. measurements
- D. unadjusted coordinates

**My answer:** A
**Correct answer:** A
**Result:** ✅ CORRECT
**Explanation:** Error ellipses graphically represent the uncertainty/precision of the ADJUSTED coordinates — the area where the true point is likely to fall; ellipse size indicates the level of uncertainty.
**Category:** Least squares / error analysis

---

## Q35 — Fractional government lot area
**Question:** The original government record of a fractional lot in the northwest quarter of Section 5 shows the following dimensions in chains: north side 19.83, east side 19.09, west side 19.31, and south side 20.14. The area (acres) of the lot on the original township plat is most nearly:

- A. 38.33
- B. 38.35
- C. 38.37
- D. 38.39

**My answer:** C
**Correct answer:** C
**Result:** ✅ CORRECT
**Solution:** Trapezoid area = [(19.31 + 19.09)/2] × [(19.83 + 20.14)/2] = 19.20 × 19.985 = 383.71 sq ch. Convert: ÷ 10 sq ch/acre = **38.37 acres**. (Reminder: 1 acre = 10 sq chains.)
**Category:** PLSS / area computation (chains & acres)

---

## Q36 — Lot area with rounded corner  [HAS FIGURE]
**Question:** One corner of a 60-ft × 120-ft lot, otherwise rectangular, is a curve with a radius of 20 ft and a central angle of 90°. The area (ft²) of the lot is most nearly:
**Figure:** Rectangle 120 ft (bottom) × 60 ft (side), one corner replaced by a 90° arc of radius 20 ft.

- A. 6,872
- B. 6,886
- C. 7,114
- D. 7,200

**My answer:** C
**Correct answer:** C
**Result:** ✅ CORRECT
**Solution:** Area = (60)(120) − [(20)(20) − π(20²)/4] = 7,200 − [400 − 314.2] = 7,200 − 85.8 = **7,114 ft²**.
**Category:** Areas / composite figures (circular segment)

---

## Q37 — Tangent-to-chord angle on a horizontal curve  [HAS FIGURE]
**Question:** The angle between Lines T (PC to PI) and LC (PC to PT), as shown, is:
**Figure:** Standard horizontal curve — PC, PI, PT, tangents T, long chord LC, central angle I (or Δ), external E, middle ordinate M, radius R, degree of curve D.

- A. I/2
- B. D/2
- C. d/2
- D. (E+M)/LC

**My answer:** A
**Correct answer:** A
**Result:** ✅ CORRECT
**Explanation:** The tangent-chord (deflection) angle at PC between the back tangent and the long chord equals half the central angle = **I/2**.
**Category:** Horizontal curves / geometry

---

## Q38 — Sag vertical curve low point
**Question:** Consider a symmetrical 400-ft sag vertical curve with PC Sta. 1+00, initial grade of −1.00%, and final grade of +3.00%. The station where the low point on the curve is located is most nearly:

- A. 1+50
- B. 2+00
- C. 2+33
- D. 3+00

**My answer:** B
**Correct answer:** B
**Result:** ✅ CORRECT
**Solution:** x = g1·L/(g1−g2) = (−1)(400)/(−1−3) = −400/−4 = 100 ft from PC. Low point station = 1+00 + 100 = **2+00**.
**Category:** Vertical curves

---

## Q39 — Order of operations (spreadsheet)
**Question:** A = B*C + D/C^2 where B=2, C=0.5, D=127 (* = multiply, / = divide, ^ = exponent). If executed by a spreadsheet or computer, the value of A is most nearly:

- A. 509
- B. 512
- C. 130,050
- D. 299,081

**My answer:** A
**Correct answer:** A
**Result:** ✅ CORRECT
**Solution:** Precedence: exponent → mult/div → add. A = 2×0.5 + 127/(0.5²) = 1 + 127/0.25 = 1 + 508 = **509**.
**Category:** Computations / order of operations

---

## Q40 — Slope to horizontal distance
**Question:** A survey crew tapes 2,000.00 ft along a straight railroad rail on a 5% grade. If this measurement is reduced to a horizontal measurement, the distance (ft) is most nearly:

- A. 1,997.50
- B. 1,999.25
- C. 1,999.97
- D. 2,002.50

**My answer:** A
**Correct answer:** A
**Result:** ✅ CORRECT
**Solution:** Slope distance 2,000; vertical = 5% × 2,000 = 100 ft. Horizontal = √(2,000² − 100²) = √3,990,000 = **1,997.50 ft**.
**Category:** Distance measurement / slope reduction

---

## Q41 — Financing cost (simple interest, declining balance)
**Question:** Your survey company has decided to purchase a robotic total station field survey system for $40,000. The payment schedule is $8,000 plus interest due at the end of each year. If financed at 8% simple interest for 5 years, the additional cost for financing versus paying cash is most nearly:

- A. $2,000
- B. $3,200
- C. $9,600
- D. $16,000

**My answer:** C
**Correct answer:** C
**Result:** ✅ CORRECT
**Solution:** Interest each year on remaining balance: 40k×8%=3,200; 32k×8%=2,560; 24k×8%=1,920; 16k×8%=1,280; 8k×8%=640. Sum = **$9,600**.
**Category:** Business / engineering economics

---

## Q42 — Confined space characteristics (OSHA)
**Question:** Which of the following characteristics describe a confined space? (Select the three that apply.)

- A. Large enough for an employee to enter fully and perform assigned work
- B. Designed for continuous occupancy by the employee
- C. Has a limited or restricted means of entry or exit
- D. Contains recognized serious safety or health hazards
- E. Has concrete floors

**My answer:** A, C, D
**Correct answer:** A, C, D
**Result:** ✅ CORRECT
**Explanation:** OSHA confined space = large enough to enter & work (A) + NOT designed for continuous occupancy + limited/restricted entry-exit (C). A permit-required confined space additionally contains recognized serious safety/health hazards (D). B is the opposite of the definition; E is irrelevant.
**Note of interest:** Trap — B ("designed for continuous occupancy") inverts criterion 3. Relevant to surveyors entering manholes/vaults.
**Category:** Safety / OSHA confined spaces

---

## Q43 — Partnership definition
**Question:** Which of the following is true of a partnership?

- A. It can sell stocks or shares.
- B. It exists independently of the people who own and manage it.
- C. It is the most common type of business.
- D. It is a business owned by two or more people working for a profit.

**My answer:** D
**Correct answer:** D
**Result:** ✅ CORRECT
**Explanation:** A partnership is a business owned by two or more people for profit. A = private corporation; B = corporation; C = sole proprietorship.
**Category:** Business / entity types

---

## Q44 — Contract consideration
**Question:** Which of the following is included in the consideration portion of a valid contract?

- A. Ability to sign for an entity
- B. Legal subject matter
- C. Names of the parties
- D. Value

**My answer:** D
**Correct answer:** D
**Result:** ✅ CORRECT
**Explanation:** Consideration is something of value exchanged between the parties — not necessarily monetary (goods, services, or promises), but something both parties bargained for.
**Category:** Business / contract law

---

## Q45 — Surveyor's foremost responsibility
**Question:** The first and foremost responsibility of a professional surveyor is to the:

- A. client
- B. employer
- C. public welfare
- D. surveying association

**My answer:** C
**Correct answer:** C
**Result:** ✅ CORRECT
**Explanation:** NCEES Model Rules §240.15 (Rules of Professional Conduct, A1): licensees' first and foremost responsibility is to safeguard the health, safety, and welfare of the public.
**Category:** Professional ethics / Model Rules

---

## Q46 — Tower height from two angle stations  [HAS FIGURE — images/Q46_tower-height-two-angles.svg] [NUMERIC ENTRY]
**Question:** To determine the height of the tower on top of the building, a surveyor measures Angle A = 22°, then moves the theodolite 100 ft toward the tower and measures Angle B = 42°. Assume the tower is vertical. The height (ft) of the tower is _____.
**Figure:** Station 1 (angle A=22°) and Station 2 (angle B=42°) on a level line 100 ft apart, both sighting the top of the tower atop the building.

**My answer:** 73.29
**Correct answer:** accepted range **73.1–73.5**
**Result:** ✅ CORRECT
**Solution (cotangent method):** H = d/(cot A − cot B) = 100/(cot 22° − cot 42°) = 100/(2.47509 − 1.11061) = **73.29 ft**. (Official used law of sines → slant dist 109.5 ft → H = 109.5·cos48° = 73.5 ft.)
**Category:** Trigonometry / inaccessible height

---

## Q47 — Standard deviation of the mean
**Question:** An angle is measured with a 1" total station 12 times: 223°14'56", 52", 58", 59", 53", 55", 223°15'02", 15'00", 14'58", 59", 55", 54". The standard deviation of the mean is most nearly:

- A. ±0.9"
- B. ±1.5"
- C. ±2.8"
- D. ±3.3"

**My answer:** A
**Correct answer:** A
**Result:** ✅ CORRECT
**Solution:** n=12, mean = 56.75". Single-obs std dev σ = 3.04". Std dev of the mean = σ/√n = 3.04/√12 = **0.880 ≈ ±0.9"**.
**Note of interest:** Distinguish σ (single observation, ~3.04) from σ of the mean (σ/√n, ~0.9). C/D are distractors using σ instead of σ_mean.
**Category:** Error theory / statistics

---

## Q48 — Error propagation for perimeter
**Question:** A surveyor is measuring the perimeter of a rectangular lot. The two adjacent sides are 75.18 ± 0.15 ft and 102.79 ± 0.20 ft (independent). The uncertainty (ft) in the perimeter is most nearly:

- A. 0.59
- B. 0.50
- C. 0.35
- D. 0.25

**My answer:** B
**Correct answer:** B
**Result:** ✅ CORRECT
**Solution:** Perimeter = 2L + 2W. σ_sum = √[(2σ_L)² + (2σ_W)²] = √[4(0.15²) + 4(0.20²)] = √(0.09 + 0.16) = √0.25 = **0.50 ft**. (Reference: error propagation eq. in FS Reference Handbook.)
**Category:** Error propagation

---

## Q49 — Feet-inches to decimal feet
**Question:** An architectural plan shows a dimension of 475 ft 4 5/8 in. out-to-out for a foundation wall. You are required to set a hub and tack at the corners of this wall. The dimension (ft) you should use is most nearly:

- A. 475.63
- B. 475.46
- C. 475.39
- D. 475.33

**My answer:** C
**Correct answer:** C
**Result:** ✅ CORRECT
**Solution:** 4 5/8 in = 4.625 in; 4.625/12 = 0.3854 ft; 475 + 0.3854 = **475.3854 ≈ 475.39 ft**.
**Category:** Unit conversion (feet-inches → decimal feet)

---

## Q50 — Redundant observation for least squares
**Question:** As the instrument person, you are asked to take a redundant observation to assist in a least squares analysis of the field traverse network. What is one way to do this?

- A. Turn an extra angle between two control points that were not traversed sequentially.
- B. Determine the prism offset for your instrument.
- C. Relevel the instrument.
- D. Check the optical plumb of the tribrach.

**My answer:** A
**Correct answer:** A
**Result:** ✅ CORRECT
**Explanation:** Redundancy = extra observations that strengthen the network in a least squares adjustment. Turning an extra angle between non-sequential control points adds a redundant observation. B/C/D are instrument setup/calibration tasks, not observations.
**Category:** Least squares / redundancy

---

# SUMMARY

**Official finalized score: 92% (46 / 50)** — per BenchPrep's category breakdown after submission.
(The post-submit summary tile momentarily displayed 94%/47; the finalized per-category breakdown sums to 46/50.)

**NCEES category breakdown (official):**
| # | Category | Complete | % Correct |
|---|----------|----------|-----------|
| 1 | Surveying Processes and Methods | 8/8 | 88% (7/8) |
| 2 | Mapping Processes and Methods | 7/7 | 86% (6/7) |
| 3 | Boundary Law and Real Property Principles | 10/10 | 90% (9/10) |
| 4 | Surveying Principles | 6/6 | 83% (5/6) |
| 5 | Survey Computations and Computer Applications | 9/9 | 100% |
| 6 | Business Concepts | 5/5 | 100% |
| 7 | Applied Mathematics and Statistics | 5/5 | 100% |

**Questions Claude answered incorrectly per in-session feedback (3):**
- **Q5** — Survey type to link infrastructure. Chose control survey; correct = **topographic survey**. (Category 1)
- **Q17** — Order title elements by importance. Put Senior rights first; NCEES key ranks **Right of possession first** (above Senior rights) — debatable/contentious. (Category 3)
- **Q30** — Lambert projection "equal distance apart" lines. Chose meridians; key = **standard parallels** — ambiguous/poorly-worded item. (Category 2)
- Plus **one question in Category 4 (Surveying Principles)** that showed "Correct" in immediate feedback but was scored wrong in final grading (accounts for 46 vs 47). All captured correct answers remain authoritative.

**Figure questions (10) — vector SVGs saved to `practice-exam/images/`:** Q6, Q7, Q9, Q13, Q19, Q20, Q28, Q36, Q37, Q46.
**Interactive question types seen:** multiple-choice (single & select-multiple), numeric entry, drag-and-drop ordering, drag-and-drop labeling, click-hotspot on figure.
**Image source pattern:** `https://s3.amazonaws.com/wmx-api-production/courses/92292/images/FS_<questionNumber>.svg` (public).

