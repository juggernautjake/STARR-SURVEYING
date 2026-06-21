# FAA Part 107 — Remote Pilot Certificate & Knowledge Exam: Structured Reference

> **Purpose:** Authoring reference for a Part 107 (sUAS / commercial drone) prep course.
> **Scope:** The initial **Unmanned Aircraft General – Small (UAG)** aeronautical knowledge exam and the rules a Remote Pilot must know.
> **Currency:** Compiled from FAA / eCFR primary sources. Information current as of **2025–2026**.
> **Compiled / accessed:** 2026-06-19.
>
> **Uncertainty flags** are marked **[VERIFY]** where a number is provider-stated rather than read verbatim from an FAA primary doc, or where the value can change. Always re-check the live ACS (FAA-S-ACS-10B) and eCFR before publishing course numbers.
>
> **Chart images note:** Many exam questions present a Sectional Chart, TAC, or Enroute Low chart excerpt. The FAA now uses **current chart images not in the legacy test supplement** (see Recent Changes). This course will need chart images that the user adds later — Section 4 below is the chart-reading text those images illustrate.

---

## TABLE OF CONTENTS
1. Exam Format & Certification Process
2. Knowledge-Area Outline (ACS) with Percentages
3. Deep Content by Area
   - 3A. Regulations (14 CFR Part 107)
   - 3B. Airspace & Operating Requirements
   - 3C. Weather
   - 3D. Loading & Performance
   - 3E. Operations
4. Sectional Chart Reading (focused subsection)
5. Study / Test Strategy & Free Resources
6. Source List with Access Dates

---

# 1. EXAM FORMAT & CERTIFICATION PROCESS

## 1.1 The Knowledge Test ("UAG")
| Item | Value | Source |
|---|---|---|
| Test name / code | **Unmanned Aircraft General – Small (UAG)** | FAA ACS / Become a Drone Pilot |
| Number of questions | **60** multiple-choice | FAA / ACS [VERIFY count vs live ACS] |
| Question format | Objective, **multiple choice, single correct answer** (3 options A/B/C) | FAA ACS |
| Time limit | **2 hours (120 minutes)** | FAA ACS |
| Passing score | **70%** (i.e., ~42 of 60 correct) | FAA |
| Where taken | **PSI Services LLC** testing centers (FAA's testing vendor; hundreds of locations) | FAA |
| Test fee | ~**$175** [VERIFY — set by PSI, changes] | PSI |
| Result validity | Knowledge test report valid **24 calendar months** for applying for the certificate [VERIFY] | FAA |
| Retake after fail | Must wait **14 calendar days** to retake [VERIFY] | FAA |
| Part 61 cert required? | **No.** No existing pilot certificate is required for the **initial** Part 107 test. | FAA |

**Important 2025–2026 testing detail:** The UAG test now includes **questions with images NOT contained in the legacy test supplement** — i.e., clearer, up-to-date excerpts from current **Sectional Charts, Instrument Approach Charts, and Low Altitude Enroute Charts**. Candidates must be able to read live-style charts, not just memorize the old supplement figures. (FAA Airman Testing Community Advisory, Aug 2025 / Apr 2026 editions.)

## 1.2 Eligibility (14 CFR 107.61–107.65)
To be eligible for a Remote Pilot Certificate with a small UAS rating, a person must:
- Be at least **16 years old**.
- Be able to **read, speak, write, and understand English** (waivable only for medical reasons preventing one of these, e.g., hearing/speech).
- Be in a **physical and mental condition** to safely operate a small UAS.
- **Pass** the initial aeronautical knowledge test (UAG) **OR** (if already a Part 61 certificate holder current on a flight review) complete the **online Part 107 training course** instead of the test.
- Be **vetted by the TSA** (security background check — runs automatically during the application).

## 1.3 Two Paths to the Initial Certificate
- **Path A — No prior pilot cert:** Pass the UAG knowledge test at a PSI center.
- **Path B — Hold a current Part 61 certificate** (other than student pilot) **with a flight review within 24 months:** Skip the knowledge test; instead complete the **free online course** "Part 107 Small Unmanned Aircraft Systems (ALC-451)" on the FAASafety.gov (FAASTeam) site, then apply. [VERIFY ALC course number on live FAASafety.gov]

## 1.4 Step-by-Step Application Process (Path A)
1. **Obtain an FTN** (FAA Tracking Number) by creating an account in **IACRA** (Integrated Airman Certification and Rating Application).
2. **Schedule & pass** the UAG knowledge test with PSI (bring a government photo ID).
3. **Complete FAA Form 8710-13** for a remote pilot certificate **via IACRA** (or paper), using your knowledge test report.
4. **TSA security vetting** runs automatically.
5. Receive a **temporary remote pilot certificate** by email (lets you fly immediately once issued).
6. The **permanent certificate** arrives by mail.
7. **Register the drone** separately (see 1.6).

## 1.5 Recurrent Training (Renewal of Knowledge Recency)
- The certificate **does NOT expire** and has **no printed expiration date**.
- A remote pilot must keep **aeronautical knowledge recency current every 24 calendar months**.
- Since the **2021 rule change**, recency is renewed by completing a **FREE online recurrent training course** on FAASafety.gov — **no in-person retest is required** (this replaced the old paid in-person recurrent knowledge test).
  - **Part 107 (non-Part-61) recurrent course:** **ALC-677**, "Part 107 Small Unmanned Aircraft Systems Recurrent." [VERIFY course code on live site]
  - **Part 61 holders' recurrent course:** **ALC-515**. [VERIFY]
- The course includes a **night operations** knowledge area (added with the 2021 night rule).
- The FAA does **not** issue a new certificate after recurrent training. You must **retain and be able to present the course completion certificate** as proof of currency.
- "24 calendar months" = good through the last day of the 24th month after completion.

## 1.6 Drone Registration & Marking
- **Part 107 registration is per-aircraft**: every individual drone gets its **own unique registration number** (contrast with recreational/44809 flyers, who may register **once** and apply that single number to all drones in their inventory).
- Register via **FAADroneZone**. Cost ~**$5**, valid **3 years** [VERIFY fee].
- Must register any sUAS **> 0.55 lb (250 g) up to 55 lb**. (Under 0.55 lb need not register for recreational use, but **all Part 107 aircraft must be registered regardless of weight**.)
- The **registration number must be marked on the exterior** of the aircraft (legible, readable without tools).
- Carry **proof of registration** (digital or paper) during operations.

## 1.7 Remote ID (RID) — Current Requirement
Remote ID is "a digital license plate" for drones. **Enforcement began September 16, 2023**: if a drone requires FAA registration, it must also **broadcast Remote ID** (unless flown inside a FRIA). **Three ways to comply:**
1. **Standard Remote ID drone** — built-in, FAA-listed broadcast capability; broadcasts ID + drone location/altitude + **control-station (pilot)** location + velocity + timestamp + emergency status.
2. **Remote ID Broadcast Module** — a retrofit add-on; broadcasts drone ID + **take-off location** (not the moving control-station location) + velocity. The pilot must keep the drone within VLOS when using a module.
3. **Fly within a FRIA** (FAA-Recognized Identification Area) — a defined geographic area (sponsored by community-based orgs / educational institutions) where drones **without** RID equipment may be flown; the drone must stay **within VLOS** of the FRIA.

## 1.8 Recreational (49 U.S.C. § 44809) vs. Part 107 — Key Differences
| Topic | Recreational (44809) | Part 107 |
|---|---|---|
| Purpose | Strictly recreational/hobby | Any non-recreational/commercial purpose |
| Pilot credential | **TRUST** test (free, no expiration) | **Remote Pilot Certificate** (UAG test + vetting) |
| Registration | One number can cover **all** your drones | **Each** drone individually registered |
| Altitude/airspace | More limited; must follow CBO safety guidelines; LAANC in controlled airspace | Up to 400 ft AGL; LAANC/DroneZone authorizations; **waivers available** |
| Flexibility | No waivers | Waivers (107.205) and airspace authorizations |
| Fallback | If you break any 44809 condition, the flight is judged **under Part 107** (greater penalties) | — |

## 1.9 Recent / 2025–2026 Changes (flag for course currency)
- **Remote ID broadcast enforcement** — in effect since **Sept 16, 2023**.
- **Night operations** — permitted under Part 107 **without a waiver** since the **2021 rule** (effective **April 21, 2021**), provided anti-collision lighting + recurrent night training (see 3A).
- **Operations over people / moving vehicles (Categories 1–4)** — rule effective **April 21, 2021**.
- **Updated ACS** — current standard is **FAA-S-ACS-10B** (replaced earlier -10/-10A editions). Confirm the live edition/date before publishing.
- **UAG test image modernization** — current real-world chart excerpts now used (Aug 2025 testing advisory).
- **BVLOS — proposed "Part 108":** FAA released the **BVLOS NPRM on Aug 7, 2025**; **60-day comment period closed Oct 6, 2025** (3,000+ comments). A final rule was targeted ~**spring 2026** under an executive-order timeline, but timing is **uncertain**. Part 108 would create a **performance-based framework** (two approval levels — Permitted Operations and Operational Certificate; risk categories by population density; area approvals replacing per-flight waivers; new roles such as Operations Supervisor / Flight Coordinator). **Status: PROPOSED, not yet final — for awareness only, not testable as a rule yet.** [VERIFY current status at publish time]

---

# 2. KNOWLEDGE-AREA OUTLINE (ACS) WITH PERCENTAGES

The exam is built from the **Remote Pilot – Small UAS Airman Certification Standards (ACS), FAA-S-ACS-10B**. Five Areas of Operation. Approximate share of the 60 questions (provider-aggregated from the ACS / FAA test blueprint — **[VERIFY ranges against live ACS]**):

| # | Area of Operation | Approx. % of test |
|---|---|---|
| I | **Regulations** | **15–25%** |
| II | **Airspace & Operating Requirements** | **15–25%** |
| III | **Weather** | **11–16%** |
| IV | **Loading & Performance** | **7–11%** |
| V | **Operations** | **35–45%** |

> Operations is by far the largest bucket — emphasize CRM, ADM/hazardous attitudes, physiology, emergency procedures, maintenance/preflight, and airport/radio ops in the course.

### ACS task structure (subtopics per area)
**I. Regulations**
- Applicability of 14 CFR Part 107
- Definitions and abbreviations
- Falsification, reproduction, alteration of certificates/records
- Accident / safety event reporting (107.9)
- Inspection, testing, and demonstration of compliance
- Remote pilot certificate eligibility & responsibilities
- Operating rules and limitations (PIC responsibilities, careless/reckless, hazardous ops, alcohol/drugs)
- Waivers (Part 107 Subpart D... waiver policy 107.200/107.205) & airspace authorizations
- Remote identification requirements

**II. Airspace & Operating Requirements**
- Airspace classification (A–G) and operating requirements
- Charts: reading the Sectional / VFR charts; latitude & longitude
- Airspace authorizations (LAANC / DroneZone), UAS Facility Maps
- Special use airspace, TFRs, NOTAMs
- Other airspace areas (MTRs, etc.)

**III. Weather**
- Sources of weather data (Aviation Weather Center, 1-800-WX-BRIEF, etc.)
- Effects of weather on small-UA performance
- METAR/TAF and other weather products
- Atmospheric stability, fronts, density altitude
- Wind & currents, micro-scale hazards (microbursts), thunderstorms
- Visibility, clouds, ceilings, fog, temperature/dew point

**IV. Loading & Performance**
- Weight, balance, and center of gravity
- Loading / payload effects on performance and stability
- Performance (density-altitude effects, charts/tables)
- Battery (LiPo) care, charging, and hazards

**V. Operations**
- Radio communications procedures (CTAF/UNICOM phraseology)
- Airport operations & traffic patterns
- Aeronautical Decision-Making (ADM) & the five hazardous attitudes + antidotes
- Crew Resource Management (CRM)
- Physiological factors affecting pilot performance (drugs/alcohol, dehydration, stress, fatigue, vision)
- Maintenance & inspection procedures; preflight
- Emergency procedures and lost-link
- Night operations
- Determining the performance of the small UA (visual scanning, VLOS)

---

# 3. DEEP CONTENT BY AREA

## 3A. REGULATIONS — 14 CFR PART 107

### Structure of Part 107
- **Subpart A — General** (applicability, definitions, falsification, **107.9 safety/accident reporting**, inspection/testing 107.7, RID).
- **Subpart B — Operating Rules** (registration/RID compliance, PIC responsibilities, operating limitations 107.51, VLSO, daylight/civil-twilight/night, careless/reckless, alcohol/drugs, right-of-way, visual observer, airspace).
- **Subpart C — Remote Pilot Certification** (eligibility, aeronautical knowledge recency, TSA vetting).
- **Subpart D — Operations Over Human Beings** (Categories 1–4, operations over moving vehicles).
- **Subpart E — Waivers** (107.200 certificate of waiver, 107.205 list of waivable sections).

### Who can fly / certificate
- Must hold a **Remote Pilot Certificate** (or be **directly supervised** by someone who does and who can immediately take control).
- One **Remote PIC** is responsible for each operation; PIC must ensure the operation is safe and compliant.

### Key operating limitations (**14 CFR 107.51** — memorize these numbers)
| Limit | Value |
|---|---|
| **Max altitude** | **400 ft AGL** — OR within a **400-ft radius of a structure**, may fly up to **400 ft above the structure's immediate uppermost limit** |
| **Max groundspeed** | **87 knots (100 mph)** |
| **Min flight visibility** (from control-station location) | **3 statute miles** |
| **Cloud clearance** | **≥ 500 ft below** clouds **and ≥ 2,000 ft horizontally** from clouds |

### Other core operating rules
- **107.29 — Daylight / civil twilight / night:** Operations allowed during day, civil twilight, **and at night**. For **civil twilight and night**, the aircraft must have **lighted anti-collision lighting visible for at least 3 statute miles**, with a flash rate sufficient to avoid a collision. (Pilot may reduce intensity if visibility is impaired and safer to do so.)
- **107.31 — Visual line of sight (VLOS):** The Remote PIC (and person manipulating controls / VO if used) must be able to see the aircraft **with vision unaided** (except corrective lenses) throughout the flight — to know its location, attitude, altitude, direction; observe airspace for traffic; and ensure it doesn't endanger anyone.
- **107.33 — Visual observer (VO):** Optional; if used, the RPIC and VO must coordinate (be able to communicate).
- **107.35 — Multiple sUAS:** A person may **not** operate or act as RPIC for **more than one** unmanned aircraft at a time (one aircraft per pilot).
- **107.37 — Right of way:** Yield right of way to **all** other aircraft (manned and unmanned); must not operate so close to another aircraft as to create a collision hazard. (See and avoid.)
- **107.23 — Hazardous operation:** No **careless or reckless** operation; **no dropping of an object** that creates a hazard to persons/property.
- **107.27 / 107.57 — Alcohol & drugs:** No operation within **8 hours** of consuming alcohol ("8 hours bottle-to-throttle"), while under the influence, with a **blood-alcohol concentration of 0.04%** or greater, or while using any drug that affects faculties contrary to safety.
- **107.25 — Operation from a moving vehicle/aircraft:** Prohibited **except** over a **sparsely populated area** (and not while transporting property for compensation/hire).
- **107.36 — Carriage of hazardous material:** Prohibited.
- **107.15 — Condition for safe operation / preflight:** RPIC must perform a **preflight inspection** to ensure the sUAS is in condition for safe operation; must not operate if it is not.
- **107.49 — Preflight familiarization, inspection, and actions** for aircraft operation (assess weather, airspace, location of persons/property, sufficient power, etc.).
- **107.19 — Remote PIC responsibilities:** Final authority and responsibility; ensures compliance; must be able to direct the sUAS to ensure compliance.

### Accident / safety-event reporting — **14 CFR 107.9** (a high-yield exam item)
Report to the FAA **no later than 10 calendar days** after any operation that results in **at least**:
- **Serious injury** to any person, **or any loss of consciousness**; **OR**
- **Damage to any property (other than the small unmanned aircraft itself)**, **unless**:
  - the **cost of repair** (materials + labor) does **not exceed $500**, **or**
  - the **fair market value** of the property does **not exceed $500** in total loss.

(So: report within **10 days** if serious injury / loss of consciousness, or property damage **> $500** excluding the drone.)

### Operations Over People & Moving Vehicles — **Subpart D, Categories 1–4**
Effective **April 21, 2021**. Categories sort by likely injury severity:
| Category | Eligibility (key criteria) | Notes |
|---|---|---|
| **Category 1** | **≤ 0.55 lb (250 g)** total at takeoff/throughout flight; **no exposed rotating parts** that could lacerate skin; must meet RID | Lightest; simplest |
| **Category 2** | Will **not cause injury ≥ that of 11 ft-lb** kinetic-energy transfer from a rigid object; no lacerating exposed parts; FAA-accepted means of compliance & declaration | Manufacturer compliance required |
| **Category 3** | Will **not cause injury ≥ that of 25 ft-lb** KE transfer; no lacerating parts; compliance/declaration | **No sustained flight over open-air assemblies**; may operate over people only within closed/restricted-access site or transiting |
| **Category 4** | Must have an **airworthiness certificate** (Part 21) and be operated per its **approved Flight Manual**; ongoing maintenance | Most capable; can operate over open-air assemblies if it **also meets standard RID** |

**Operations over moving vehicles (107.145):** Permitted under Cat 1/2/3 only if the aircraft **remains within/over a closed- or restricted-access site** (and people in vehicles are on notice), **or does not maintain sustained flight over** moving vehicles. Cat 4 per its operating limitations.

### Night operations (post-2021 rule)
- Night flight is **allowed without a waiver** if the aircraft has **anti-collision lighting visible for 3 SM** (107.29) and the remote pilot has completed updated training (initial test or recurrent training covers night).
- All previously issued **night waivers were cancelled** once the new rule took effect (May 17, 2021).

### Waivers (107.200) & airspace authorizations
- **107.200 — Certificate of Waiver:** FAA may issue a waiver allowing deviation from listed rules if the applicant shows the operation can be conducted **safely** under the terms of the waiver.
- **107.205 — Waivable sections** (memorize the list): **107.25** (moving vehicle), **107.29** (daylight — historical), **107.31** (VLOS), **107.33** (VO), **107.35** (multiple sUAS), **107.37(a)** (right of way), **107.39** (operation over people), **107.41** (operation in certain airspace), **107.51** (operating limitations).
  - **Not waivable** for **carrying another's property for compensation/hire**: 107.25 and 107.31.
- **Airspace authorizations** (to fly in controlled airspace) are separate from operational waivers — obtained via **LAANC** or **FAADroneZone** (see 3B).

### Recreational vs. Part 107 (regulatory framing)
- Recreational ops fly under **49 U.S.C. § 44809** ("Exception for Limited Recreational Operations"); must follow a **CBO's safety guidelines**, pass **TRUST**, register, and stay within VLOS.
- Part 107 grants **greater privileges** (altitudes, airspace access, waivers) in exchange for **greater vetting** (the certificate).

---

## 3B. AIRSPACE & OPERATING REQUIREMENTS

### Airspace classes (controlled vs. uncontrolled)
| Class | Type | Typical dimensions | Drone relevance |
|---|---|---|---|
| **A** | Controlled | **18,000 ft MSL up to FL600** | Not relevant to sUAS (way above 400 ft) |
| **B** | Controlled | Surface up to ~10,000 ft MSL around the **busiest** airports; "upside-down wedding cake"; **solid blue** rings on sectional | **Authorization required** |
| **C** | Controlled | Surface to ~4,000 ft AGL around busy airports; **solid magenta** rings | **Authorization required** |
| **D** | Controlled | Surface to ~2,500 ft AGL around towered airports; **dashed blue** rings | **Authorization required** |
| **E** | Controlled | Begins at surface, **700 ft AGL**, or **1,200 ft AGL** (or 14,500 MSL); **magenta** (700 AGL) and **blue** (1,200 AGL) **vignettes**; dashed-magenta = Class E to surface | Authorization may be required if it reaches the surface near an airport |
| **G** | **Uncontrolled** | Surface up to the base of overlying Class E (commonly **700 or 1,200 ft AGL**) | **No ATC authorization needed**; default legal sUAS airspace below 400 ft AGL |

> **Drone takeaway:** You may fly in **Class G** up to 400 ft AGL **without** ATC authorization. To fly in **controlled airspace (B, C, D, and surface-area E)** you **must** have an **airspace authorization** (LAANC or DroneZone) **before** flying.

### Airspace authorizations — LAANC & DroneZone
- **LAANC** (Low Altitude Authorization and Notification Capability): a partnership between FAA and approved companies ("USS" — UAS Service Suppliers). Gives **near-real-time** authorization to fly in controlled airspace **up to the altitude posted on the UAS Facility Map (UASFM) grid** for that location.
- **UAS Facility Maps (UASFM):** grids around airports showing the **maximum altitude** (e.g., 0, 100, 200, 300, 400 ft) at which LAANC can auto-approve operations. A **"0" grid** means automatic LAANC is unavailable there — a **further-coordination** request to the FAA is required (handled by certificated remote pilots only, slower).
- **FAADroneZone:** the FAA portal for authorizations at airports **not** LAANC-enabled, and for **waivers** and further-coordination requests. **Not** near-real-time.
- Authorizations come with terms (time window, altitude cap, sometimes ATC notification).

### Reading lat/long & where you can/can't fly
- Latitude (N/S, parallels) and longitude (E/W, meridians) locate a point; questions ask you to find coordinates on a sectional grid.
- **B4UFLY** app (FAA-approved providers) shows where you can fly, restrictions, and active TFRs/airspace — good for trip planning and the recreational/Part 107 audience alike.

### Special Use Airspace (SUA)
- **Regulatory** (created via rulemaking, 14 CFR Part 73): **Prohibited Areas (P-)** — flight prohibited; **Restricted Areas (R-)** — hazardous activity (e.g., artillery), flight restricted, may enter only with controlling-agency permission when "cold."
- **Non-regulatory:** **MOAs** (Military Operations Areas — separate military training from IFR traffic; VFR/sUAS should exercise caution); **Warning Areas (W-)** — like restricted but over international waters; **Alert Areas (A-)** — high volume of pilot training or unusual activity; **CFAs** (Controlled Firing Areas — not charted, activity ceases when traffic approaches); **National Security Areas (NSA)**.
- SUA is **charted** on Sectional / TAC / Enroute charts with **hours of operation, altitudes, and controlling agency**.

### TFRs & NOTAMs
- **TFR (Temporary Flight Restriction):** issued via an **FDC NOTAM**; restricts a defined area (often for VIP movement, disasters, sporting events — e.g., stadiums). **Drones must comply**; many TFRs prohibit all UAS. Check before every flight.
- **NOTAM (Notice to Air Missions):** time-critical aeronautical information (closed runways, outages, airspace restrictions). Part 107 authorizations must also satisfy any governing NOTAM/TFR.

---

## 3C. WEATHER

### Weather sources
- **Aviation Weather Center** (aviationweather.gov; formerly ADDS), **1-800-WX-BRIEF** (Flight Service / Leidos), **EFB/online briefers**. Get METARs, TAFs, charts, AIRMET/SIGMET, PIREPs.

### METAR (current observation) — decode every element, in order
`METAR KXYZ 121753Z AUTO 27015G25KT 10SM FEW050 SCT250 27/12 A2992 RMK AO2`
1. **Report type** — `METAR` (routine, hourly) or `SPECI` (special, off-schedule).
2. **Station** — 4-letter ICAO identifier (`KXYZ`).
3. **Date/time** — `121753Z` = **12th day, 1753 Zulu (UTC)**. (Aviation weather is in **UTC/Zulu**.)
4. **Modifier** — `AUTO` (automated station) or `COR` (corrected).
5. **Wind** — `27015G25KT` = from **270°** (true) at **15 kt, gusting 25 kt**. `VRB` = variable; `00000KT` = calm.
6. **Visibility** — `10SM` = 10 statute miles.
7. **Weather phenomena** — e.g., `RA` rain, `BR` mist, `FG` fog, `TS` thunderstorm, `-`/`+` light/heavy.
8. **Sky condition** — `SKC/CLR`, `FEW` (1–2 oktas), `SCT` (3–4), `BKN` (5–7), `OVC` (8); number = height in **hundreds of feet AGL** (`FEW050` = few at 5,000 ft). A **ceiling** = lowest **BKN** or **OVC** layer.
9. **Temperature/Dewpoint** — `27/12` °C, separated by a slash; `M` prefix = minus (`M03`). **Small temp–dewpoint spread → fog/low cloud likely.**
10. **Altimeter** — `A2992` = **29.92 inHg**.
11. **Remarks** — `RMK …` (e.g., `AO2` = automated station with precip sensor).

### TAF (Terminal Aerodrome Forecast)
- Forecast for ~**5 SM around an airport**, typically **24–30 hr**, issued ~4×/day.
- Similar coding to METAR, **valid period** group (e.g., `1218/1324`), and change groups: **`FM`** (rapid change from a time), **`BECMG`** (gradual), **`TEMPO`** (temporary <1 hr fluctuations), **`PROB30/40`** (probability of conditions).

### Density altitude (high-yield for performance)
- **Density altitude = pressure altitude corrected for non-standard temperature.** It's the altitude the aircraft "feels" it's flying at.
- Standard conditions: **29.92 inHg, 15 °C** at sea level; standard lapse ~**2 °C per 1,000 ft**.
- **High density altitude** (hot, high elevation, high humidity, low pressure) = **thinner air → less lift, less thrust, props less efficient → degraded sUAS performance** (shorter flight time, sluggish climb, reduced payload).
- Memory aid: **"High, Hot, and Humid"** all **raise** density altitude and **hurt** performance.

### Stability, fronts, hazards
- **Stable air:** stratiform clouds, steady precipitation, poor visibility (haze/fog), smooth air.
- **Unstable air:** cumuliform clouds, showery precip, good visibility, turbulence, gusty winds.
- **Fronts:** boundaries between air masses (cold, warm, stationary, occluded) — cause wind shifts, clouds, precip, turbulence.
- **Thunderstorms:** avoid entirely; hazards include severe turbulence, lightning, hail, and **microbursts** (intense localized downdrafts with dangerous, rapidly shifting **wind shear** — can slam a small UA to the ground). Three stages: cumulus, mature (most violent), dissipating.
- **Fog** forms when temp–dewpoint spread is small (radiation, advection, upslope, steam fog).
- **Temperature inversions** can trap haze and reduce visibility.

### How weather affects sUAS
- **Wind:** small/light aircraft are very wind-sensitive; gusts/shear degrade control and drain battery (fighting wind). Watch for mechanical turbulence near buildings/terrain.
- **Precipitation/humidity:** moisture can damage electronics; most sUAS are not weatherproof.
- **Cold:** reduces **LiPo battery** capacity/voltage → much shorter flight time and risk of sudden voltage sag.
- **Visibility/clouds:** must maintain **3 SM** vis and VLOS, and **500 below / 2,000 horizontal** cloud clearance.

---

## 3D. LOADING & PERFORMANCE

### Weight & balance / center of gravity (CG)
- **Total weight** (aircraft + battery + payload + any attachments) must stay **within manufacturer limits**.
- **CG** must remain within limits; an **out-of-balance** load makes the aircraft unstable, hard to control, and reduces efficiency. Mount payloads (cameras, sensors) so the CG stays centered.
- **Overloading** reduces climb performance, maneuverability, and flight time, and increases stall/loss-of-control risk.

### Payload effects
- Heavier payload → **more lift required → more power → shorter flight time** and reduced reserve.
- Asymmetric payload shifts CG; secure all loads so nothing shifts in flight.

### Density-altitude effects on performance
- As covered in 3C: **high density altitude reduces lift and thrust.** On a hot day at high elevation, the same drone climbs slower, carries less, and flies shorter. Reduce payload and expect reduced performance.

### Battery (LiPo) care & hazards (high-yield)
- **LiPo (lithium polymer)** packs are energy-dense but **hazardous**: risk of **fire/explosion (thermal runaway)** if punctured, overcharged, over-discharged, short-circuited, or physically damaged (**swelling/puffing = retire immediately**).
- **Best practices:** charge with the correct LiPo charger; never leave charging unattended; store at **storage charge** (~**3.8 V/cell** / ~50%), cool and dry, in a **fireproof bag/container**; don't fly or charge damaged/swollen packs; let packs cool before charging; don't over-discharge (respect low-voltage cutoff).
- **Cold** reduces capacity and can cause sudden voltage drop → unexpected landings.
- Always plan with **battery reserve** — don't fly to 0%.

### Performance charts
- Some manufacturers publish performance data (max flight time vs. payload, wind, temperature). Know how to read a simple chart/table to predict endurance and capability under given conditions.

---

## 3E. OPERATIONS (largest exam area — ~35–45%)

### Crew Resource Management (CRM)
- Effective use of **all available resources** — people (VO, second pilot, bystander control), hardware, and information — to operate safely.
- Brief the crew; define roles (RPIC vs. person manipulating controls vs. VO); maintain clear, continuous **communication**; use checklists.

### Aeronautical Decision-Making (ADM) & the Five Hazardous Attitudes
**ADM** = a systematic approach to consistently determining the best course of action. Self-assessment tools include **IMSAFE** (Illness, Medication, Stress, Alcohol, Fatigue, Emotion) and **PAVE** (Pilot, Aircraft, enVironment, External pressures) for risk; the **DECIDE** model (Detect, Estimate, Choose, Identify, Do, Evaluate).

**The five hazardous attitudes and their antidotes (memorize exactly):**
| Hazardous attitude | Thought | **Antidote** |
|---|---|---|
| **Anti-Authority** ("Don't tell me!") | The rules don't apply to me | **"Follow the rules. They are usually right."** |
| **Impulsivity** ("Do something quickly!") | Act on the first thought | **"Not so fast. Think first."** |
| **Invulnerability** ("It won't happen to me") | Accidents happen to others | **"It could happen to me."** |
| **Macho** ("I can do it") | Prove I'm better; take risks | **"Taking chances is foolish."** |
| **Resignation** ("What's the use?") | I'm not in control | **"I'm not helpless. I can make a difference."** |

### Physiological factors affecting performance
- **Alcohol:** **8-hour bottle-to-throttle**, no flying under the influence, **BAC < 0.04%**; effects linger after the legal window (hangover impairs judgment).
- **Drugs/medication:** many OTC/prescription drugs impair faculties — don't fly if a medication affects safety.
- **Dehydration & heat stress:** reduce alertness, vision, and decision-making — hydrate, take breaks.
- **Stress & fatigue:** degrade attention, reaction time, judgment — self-assess with IMSAFE; don't fly fatigued.
- **Vision:** scanning is essential; **night vision** takes ~30 min to adapt and is degraded by bright light; use **off-center viewing** and scanning techniques at night.

### Radio communications & phraseology
- Many sUAS sites are near **non-towered airports**; monitor the **CTAF (Common Traffic Advisory Frequency)** / **UNICOM** to maintain situational awareness of manned traffic.
- Know basic phraseology and the **traffic pattern** terminology (see below). RPIC should **yield to and avoid** manned aircraft at all times.

### Airport operations & traffic patterns
- Standard pattern legs: **upwind, crosswind, downwind, base, final**; standard turns are **left** unless charted otherwise.
- Pattern altitude typically ~**1,000 ft AGL** for light aircraft — but drones near an airport must especially watch for aircraft on **final approach and departure** (low altitude, where sUAS operate). Determine **runway in use** from wind (aircraft take off/land into the wind; a **segmented circle / wind sock / tetrahedron** indicates wind direction).

### Maintenance & preflight inspection
- Follow **manufacturer maintenance** schedule; keep records; inspect **propellers (cracks/nicks), motors, airframe, battery, control station, firmware, and software** before flight.
- **Preflight (107.49):** check weather, airspace & authorizations, NOTAMs/TFRs, location of people/property, takeoff/landing area, sufficient battery, RID functioning, and that the sUAS is in condition for safe operation.

### Emergency procedures
- Know the manufacturer's **lost-link / return-to-home (RTH)** behavior and **failsafe** settings.
- Plan for **flyaways, low battery, loss of GPS, motor/prop failure** — have a plan to land or ditch over the **least-populated** area; maintain control to avoid injury/property damage.
- **Report** qualifying accidents per **107.9** (10 days).

### Fire & first aid / security
- LiPo fires: use appropriate extinguishing (smother/cool; class for electrical/metal fires); have a plan and a fireproof storage method.
- **Operational security:** be alert to suspicious activity around sensitive sites; don't compromise national-security areas; protect data/imagery as appropriate.

### Maintaining VLOS & visual scanning
- Keep the aircraft within **unaided VLOS** at all times (corrective lenses OK). Don't rely solely on FPV — VLOS is the legal standard.
- Continuously **scan the airspace** for other aircraft; use a **VO** to extend coverage when needed; keep the aircraft close enough to judge attitude, altitude, and direction.

### Night operations (operational view)
- Allowed with **3-SM anti-collision lighting** (107.29) and night training.
- Account for **degraded depth perception and night vision**, use scanning techniques, and ensure the lighting is functional before launch.

---

# 4. SECTIONAL CHART READING (focused subsection)

Many UAG questions show a **Sectional Aeronautical Chart** (or TAC / Enroute Low) excerpt and ask which airspace applies, what altitude you can fly, or what a symbol means. **Course needs chart images (user adds later); this is the legend text.**

### Airspace ring/vignette colors
- **Class B:** **solid blue** lines (concentric rings, "upside-down wedding cake").
- **Class C:** **solid magenta** lines.
- **Class D:** **dashed blue** lines; a **boxed number** = ceiling in hundreds of feet MSL.
- **Class E to the surface:** **dashed magenta** line.
- **Class E starting at 700 AGL:** **fuzzy magenta vignette** (faded magenta, fades **outward**).
- **Class E starting at 1,200 AGL:** **fuzzy blue vignette**.
- Inside the faded magenta = floor 700 AGL; outside it (no vignette) = floor 1,200 AGL (or as noted).

### Airport symbols
- **Magenta airport symbol** = airport **without** an operating control tower.
- **Blue airport symbol** = airport **with** an operating control tower.
- **Ticks/extensions** around the symbol indicate fuel/services availability.
- **Star** above the airport symbol = rotating beacon.
- Airport data block lists name, **elevation (MSL)**, **CTAF/UNICOM frequency** (often with a magenta ☐ flag for CTAF), runway length, lighting.

### Frequencies
- **CTAF** noted with a "C" in a magenta box near the airport; **UNICOM** typically 122.7/122.8/122.9/123.0.
- Class B/C/D communication and **approach/departure** frequencies appear in boxed text near the airspace.

### Maximum Elevation Figure (MEF)
- Large **bold blue numbers** in each quadrangle (e.g., `1²5` = 12,500 ft MSL) = **Maximum Elevation Figure** — the highest terrain/obstacle in that latitude–longitude block, in **thousands and hundreds of feet MSL**. Reassures terrain clearance.

### Obstacles & terrain
- **Obstacles** (towers) shown as inverted-V symbols; numbers give **top MSL** (bold) and **AGL** (in parentheses). Tall obstacle groups and **lighted** obstacles are marked.
- Terrain shown by **contour lines and color tints** (elevation).

### Special use & other
- **Restricted/Prohibited/Warning/Alert/MOA** areas outlined with **blue or magenta hatched borders**; a tabbed box on the chart lists each area's **number, altitude, time of use, and controlling agency**.
- **Latitude/longitude** tick marks along the neat lines let you read coordinates.

### Reading workflow for a chart question
1. Locate the point (by airport name or lat/long).
2. Identify the **airspace** at that point and altitude (color of rings/vignette → class).
3. Decide if **authorization** is needed (controlled = yes; Class G = no).
4. Check for **SUA, obstacles, MEF, and any TFR/NOTAM** that affects the operation.

---

# 5. STUDY / TEST STRATEGY & FREE RESOURCES

### Best free FAA resources (all PDF/online, no cost)
- **Remote Pilot – Small UAS ACS (FAA-S-ACS-10B)** — the exact knowledge blueprint; map your study to its tasks.
- **Remote Pilot – sUAS Study Guide (FAA-G-8082-22)** — the FAA's own prep book covering all five areas.
- **AC 107-2A — Small Unmanned Aircraft Systems (sUAS)** — official guidance interpreting Part 107.
- **Unmanned Aircraft General (UAG) Sample Questions (PDF)** — official practice questions; mirror the test style.
- **Pilot's Handbook of Aeronautical Knowledge (PHAK)** chapters — deeper weather, airspace, ADM, charts.
- **Aviation Weather Services AC 00-45** — METAR/TAF decoding reference.
- **Aeronautical Chart Users' Guide** — full sectional symbology legend (great for Section 4 images).
- **14 CFR Part 107** on **eCFR** — the actual rules, always current.
- **FAA "Become a Drone Pilot"** page — the authoritative process checklist.

### Test-taking strategy
- **Master Operations + Airspace first** — together they're ~50–70% of the test; Operations alone is the single biggest area.
- **Memorize the hard numbers:** 400 ft AGL, 87 kt / 100 mph, 3 SM visibility, 500 ft below / 2,000 ft horizontal clouds, 0.04 BAC / 8 hr, 107.9 = 10 days / $500, 3-SM anti-collision lights, OOP Cat 1 = 0.55 lb, recurrent = 24 calendar months.
- **Drill chart reading** with real sectional excerpts (airspace colors, airport symbols, MEF) — high frequency on the test.
- **Practice METAR/TAF decoding** until automatic; convert Zulu↔local.
- **Memorize the 5 hazardous attitudes + antidotes verbatim** (easy points).
- **Eliminate wrong answers** — questions have 3 options; two are usually clearly wrong if you know the number/rule.
- **Manage the clock:** 60 questions in 120 min = ~2 min each; flag and return.
- Take several **full-length practice tests**; aim consistently **>85%** before scheduling, since you need 70% live.

---

# 6. SOURCE LIST WITH ACCESS DATES

All accessed **2026-06-19**. Primary = FAA.gov and eCFR.gov.

**Exam format / certification / recurrent**
- FAA, "Become a Certificated Remote Pilot" — https://www.faa.gov/uas/commercial_operators/become_a_drone_pilot
- FAA, "Where can I find study materials for the Part 107 aeronautical knowledge test?" — https://www.faa.gov/faq/where-can-i-find-study-materials-part-107-aeronautical-knowledge-test
- FAA, Remote Pilot – sUAS **ACS (FAA-S-ACS-10B)** — https://www.faa.gov/training_testing/testing/acs/uas_acs.pdf
- FAA, UAG Sample Questions — https://www.faa.gov/sites/faa.gov/files/training_testing/testing/test_questions/uag_questions.pdf
- FAA, Airman Testing Community Advisory (Aug 2025) — https://www.faa.gov/training_testing/testing/community_advisory_August_2025.pdf ; (Apr 2026) — https://www.faa.gov/training_testing/testing/April_2026_Edition.pdf
- FAA, "Recurrent Training Courses for Drone Pilots Available Online" — https://www.faa.gov/newsroom/recurrent-training-courses-drone-pilots-available-online
- FAA FAQ, certificate has no expiration / recurrency — https://www.faa.gov/faq/i-dont-see-expiration-date-my-part-107-remote-pilots-certificate-do-i-have-take-test-annually ; https://www.faa.gov/faq/after-part-107-pilot-completes-online-alc-training-course-renew-hisher-remote-pilot-currency
- FAA, AIM/AIP Ch.11 Sec.5, UAS Pilot Testing, Certification & Responsibilities — https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap11_section_5.html

**Regulations (eCFR Part 107)**
- eCFR, 14 CFR Part 107 — https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-107
- eCFR, 107.9 Safety event reporting — https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-107/subpart-A/section-107.9
- eCFR, 107.51 Operating limitations — https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-107/subpart-B/section-107.51
- eCFR, Subpart B Operating Rules — https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-107/subpart-B
- eCFR, Subpart D Operations Over Human Beings (incl. 107.120/107.125/107.130/107.140/107.145) — https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-107/subpart-D
- FAA, AC 107-2A — https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1038977 (PDF: https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_107-2A.pdf)
- FAA, Operations Over People overview — https://www.faa.gov/uas/commercial_operators/operations_over_people ; OOP Final Rule — https://www.faa.gov/sites/faa.gov/files/2021-08/OOP_Final%20Rule.pdf
- FAA, Part 107 Waivers — https://www.faa.gov/uas/commercial_operators/part_107_waivers
- FAA, Part 107 Fact Sheet / Small UAS Regulations — https://www.faa.gov/newsroom/small-unmanned-aircraft-systems-uas-regulations-part-107

**Remote ID & recreational**
- FAA, Remote Identification of Drones — https://www.faa.gov/uas/getting_started/remote_id
- FAA, FRIAs — https://www.faa.gov/uas/getting_started/remote_id/fria
- FAA, Remote ID Executive Summary — https://www.faa.gov/sites/faa.gov/files/uas/getting_started/remote_id/RemoteID_Executive_Summary.pdf
- FAA, Recreational Flyers & CBOs — https://www.faa.gov/uas/recreational_flyers

**Airspace, LAANC, charts**
- FAA, Airspace 101 – Rules of the Sky — https://www.faa.gov/uas/getting_started/where_can_i_fly/airspace_101
- FAA, Part 107 Airspace Authorizations — https://www.faa.gov/uas/commercial_operators/part_107_airspace_authorizations
- FAA, UAS Data Exchange (LAANC) — https://www.faa.gov/uas/getting_started/laanc
- FAA, UAS Facility Maps — https://www.faa.gov/uas/commercial_operators/uas_facility_maps
- FAA, AIM Ch.3 Controlled/Class G/Special Use Airspace — https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap3_section_2.html ; .../chap3_section_3.html ; .../chap3_section_4.html
- FAA, Aeronautical Chart Users' Guide — https://aeronav.faa.gov/user_guide/cug-complete_20250220.pdf
- FAA, PHAK Ch.15 Airspace — https://www.faa.gov/sites/faa.gov/files/17_phak_ch15.pdf

**Weather**
- FAA, Remote Pilot Study Guide (FAA-G-8082-22) — https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/remote_pilot_study_guide.pdf
- FAA, AC 00-45 Aviation Weather Services — https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_00-45E.pdf
- FAA, PHAK Ch.13 Weather Services — https://www.faa.gov/sites/faa.gov/files/15_phak_ch13.pdf

**Operations / ADM / physiology**
- FAA, AC 60-22 Aeronautical Decision Making — https://www.faa.gov/sites/faa.gov/files/2022-11/AC60-22_Chap%201-3.pdf
- FAA, PHAK Ch.2 ADM — https://www.faa.gov/sites/faa.gov/files/04_phak_ch2.pdf
- FAA, Risk Management Handbook — https://www.faa.gov/sites/faa.gov/files/2022-06/risk_management_handbook_2A.pdf

**BVLOS / Part 108 (proposed)**
- (Industry analyses of FAA NPRM, Aug 7 2025; comments closed Oct 6 2025) — DLA Piper, Pillsbury, Drone Pilot Ground School. **Status PROPOSED.** Re-verify at the Federal Register for the live FAA NPRM/final-rule docket before publishing.

---

## QUICK-REFERENCE NUMBER SHEET (for course "cheat card")
- Test: **60 Q, 120 min, 70% to pass, $175, PSI** • Recurrent: **free online, every 24 calendar months**
- Max altitude **400 ft AGL** (or 400 ft above a structure within 400 ft radius)
- Max groundspeed **87 kt / 100 mph** • Min visibility **3 SM** • Clouds **500 below / 2,000 horizontal**
- Anti-collision lights for night/twilight: visible **3 SM**
- Alcohol: **8 hr** bottle-to-throttle, **BAC < 0.04%** • One aircraft per pilot
- Accident report (107.9): **within 10 calendar days** if serious injury / loss of consciousness or property damage **> $500** (excluding the drone)
- OOP Cat 1 ≤ **0.55 lb** • Cat 2 **11 ft-lb** KE • Cat 3 **25 ft-lb** KE • Cat 4 = airworthiness cert
- Eligibility: **16+**, English, sound condition, TSA vetting, IACRA application
- 5 hazardous attitudes: **Anti-Authority, Impulsivity, Invulnerability, Macho, Resignation** (+ antidotes)
- Register every Part 107 drone individually via **FAADroneZone**; **Remote ID** required since **Sept 16, 2023**

*End of reference. Re-verify all [VERIFY]-flagged values and the BVLOS/Part 108 status against live FAA/eCFR sources before course publication.*
