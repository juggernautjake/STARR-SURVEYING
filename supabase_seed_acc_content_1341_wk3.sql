-- ============================================================================
-- ACC SRVY 1341 — Week 3: Magnetic Declination Review, Smartphone Compass
-- Applications, Field Notekeeping Best Practices & Survey Trade Magazines
-- ============================================================================
-- Full lesson content, topics (4), quiz questions (16), practice problems (20),
-- and flashcards (25).
--
-- Module ID : acc00003-0000-0000-0000-000000000003
-- Lesson ID : acc03b03-0000-0000-0000-000000000001
--
-- Topic UUIDs:
--   acc03a03-0001  Magnetic Declination Review
--   acc03a03-0002  Smartphone Compass Applications
--   acc03a03-0003  Field Notekeeping Best Practices
--   acc03a03-0004  Survey Trade Magazines
--
-- Run AFTER supabase_seed_acc_courses.sql and wk1/wk2 seeds.
-- Safe to re-run (uses DELETE before INSERT).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. LESSON CONTENT (rich HTML)
-- ────────────────────────────────────────────────────────────────────────────

UPDATE learning_lessons SET

title = 'Week 3: Magnetic Declination Review, Smartphone Compass Apps, Field Notekeeping & Trade Magazines',

description = 'A deeper review of magnetic declination with four worked DMS-arithmetic examples, an introduction to smartphone compass applications (Hunter Pro Compass and Theodolite), comprehensive field notekeeping best practices including legal status, symbols, and sketching techniques, plus an overview of professional survey trade magazines.',

learning_objectives = ARRAY[
  'Solve multi-step magnetic declination problems using DMS arithmetic with borrowing',
  'Apply secular variation rates to update historical declination values to the present',
  'Describe the features and field uses of the Hunter Pro Compass and Theodolite smartphone apps',
  'Explain why field notes are legal documents and list the consequences of improper notekeeping',
  'Identify the essential components of a properly maintained field book (title page, TOC, legend, sketches)',
  'Draw standard survey symbols for traverse points, buildings, vegetation, and utilities',
  'Demonstrate proper page numbering, date/weather headers, and proportional field sketches',
  'Identify major survey trade publications and describe the professional development resources they offer'
],

estimated_minutes = 50,

content = '
<h2>Week 3: Magnetic Declination Review, Smartphone Compass Apps, Field Notekeeping &amp; Trade Magazines</h2>

<p>Last week you learned the fundamentals of compass surveying — bearings, azimuths, and the concept of magnetic declination. This week we go deeper. You will solve declination problems that require <strong>DMS arithmetic with borrowing</strong>, learn to apply <strong>secular variation</strong> to update old declination values, explore how <strong>smartphone compass apps</strong> are used in reconnaissance fieldwork, master the art of <strong>field notekeeping</strong> (the most important skill a beginning surveyor can develop), and discover the <strong>trade magazines</strong> that keep working professionals current.</p>

<hr/>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- TOPIC 1 — MAGNETIC DECLINATION REVIEW                              -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<h2>1. Magnetic Declination — Deeper Review</h2>

<img src="/lessons/cls3/cls3_01_compass_rose.svg" alt="Compass rose showing relationship between true north and magnetic north" style="max-width:100%; margin:1rem 0;" />

<p>Recall from Week 2 that <strong>magnetic declination</strong> is the angle between true (geographic) north and magnetic north at a given location and time. It is the single most important correction in compass surveying. An uncorrected declination error of just 3° over a 1,000-foot line produces a lateral offset of about <strong>52 feet</strong> — enough to place a boundary on a neighbor''s property.</p>

<h3>Key Terminology Review</h3>
<ul>
  <li><strong>Isogonic lines</strong> — lines on a map connecting points of equal declination</li>
  <li><strong>Agonic line</strong> — the isogonic line where declination = 0° (magnetic north = true north); currently runs roughly from the Great Lakes through Florida</li>
  <li><strong>East declination</strong> — magnetic north is <em>east</em> of true north (needle points right of true north)</li>
  <li><strong>West declination</strong> — magnetic north is <em>west</em> of true north (needle points left of true north)</li>
  <li><strong>Secular variation</strong> — the slow, predictable annual change in declination at a given location</li>
</ul>

<img src="/lessons/cls3/cls3_02_isogonic_lines_map.svg" alt="NOAA isogonic lines map of the United States showing lines of equal magnetic declination" style="max-width:100%; margin:1rem 0;" />

<h3>The Declination Diagram</h3>

<p>Every USGS topographic map and most survey plats include a <strong>declination diagram</strong> showing the angular relationship between true north (★), magnetic north (MN arrow), and grid north (GN). The diagram is <em>not drawn to scale</em> — it is schematic only. Always read the numeric value printed beside the diagram.</p>

<img src="/lessons/cls3/cls3_03_compass_needle_diagram.svg" alt="Compass needle diagram showing magnetic north versus true north with declination angle" style="max-width:100%; margin:1rem 0;" />

<img src="/lessons/cls3/cls3_04_east_west_declination_diagram.svg" alt="Side-by-side diagrams showing east declination (needle right of TN) and west declination (needle left of TN)" style="max-width:100%; margin:1rem 0;" />

<h3>Polaris and True North</h3>

<p>The most reliable field method for finding true north is <strong>observation of Polaris</strong> (the North Star). Polaris is located within about 0.7° of the celestial pole. A careful Polaris observation, corrected with published tables from the Nautical Almanac, can establish a true-north reference line accurate to better than ±15″ — far superior to any compass.</p>

<img src="/lessons/cls3/cls3_05_declination_polaris_diagram.svg" alt="Diagram showing Polaris near the celestial pole and how it establishes true north" style="max-width:100%; margin:1rem 0;" />

<p>In modern practice, <strong>NOAA''s World Magnetic Model (WMM)</strong> provides declination values for any location. The current model is <strong>WMM2025</strong>, updated every 5 years. You can look up declination at <em>ngdc.noaa.gov/geomag/calculators/magcalc.shtml</em>.</p>

<h3>The Master Formula</h3>

<p>The core relationship is simple:</p>

<div style="background:#f0f4f8; padding:1rem; border-left:4px solid #2563eb; margin:1rem 0; font-size:1.1em;">
  <strong>True Bearing = Magnetic Bearing + East Declination</strong><br/>
  <strong>True Bearing = Magnetic Bearing − West Declination</strong><br/><br/>
  Or concisely: <strong>True = Magnetic + Declination</strong> (east = positive, west = negative)
</div>

<h3>Secular Variation Formula</h3>

<p>Declination changes over time. To update a historical declination value:</p>

<div style="background:#f0f4f8; padding:1rem; border-left:4px solid #2563eb; margin:1rem 0;">
  <strong>Current Declination = Old Declination + (Years Elapsed × Annual Change)</strong><br/>
  <em>Where annual change carries its own sign (positive if increasing east, negative if increasing west)</em>
</div>

<hr/>

<h3>Worked Example 1 — Basic East Declination</h3>

<div style="background:#fffbeb; padding:1rem; border:1px solid #f59e0b; border-radius:6px; margin:1rem 0;">
  <strong>Given:</strong> Magnetic bearing = N 24°15''00″ E; Declination = 6°30''00″ East<br/>
  <strong>Find:</strong> True bearing<br/><br/>
  <strong>Solution:</strong><br/>
  True = Magnetic + East Declination<br/>
  True = 24°15''00″ + 6°30''00″<br/><br/>
  Seconds: 00″ + 00″ = 00″<br/>
  Minutes: 15'' + 30'' = 45''<br/>
  Degrees: 24° + 6° = 30°<br/><br/>
  <strong>True bearing = N 30°45''00″ E</strong>
</div>

<h3>Worked Example 2 — West Declination with Secular Variation</h3>

<div style="background:#fffbeb; padding:1rem; border:1px solid #f59e0b; border-radius:6px; margin:1rem 0;">
  <strong>Given:</strong> 1985 declination = 4°15''00″ W; Annual change = 1''30″ E<br/>
  Magnetic bearing (today, 2025) = N 72°20''00″ E<br/>
  <strong>Find:</strong> Current declination, then true bearing<br/><br/>
  <strong>Step 1 — Update declination:</strong><br/>
  Years elapsed = 2025 − 1985 = 40 years<br/>
  Total change = 40 × 1''30″ = 40 × 90″ = 3600″ = 60''00″ = 1°00''00″ East<br/><br/>
  Since the annual change is eastward, declination is becoming less west:<br/>
  Current declination = 4°15''00″ W − 1°00''00″ = <strong>3°15''00″ W</strong><br/><br/>
  <strong>Step 2 — Apply to bearing:</strong><br/>
  True = Magnetic − West Declination<br/>
  True = 72°20''00″ − 3°15''00″<br/><br/>
  Seconds: 00″ − 00″ = 00″<br/>
  Minutes: 20'' − 15'' = 05''<br/>
  Degrees: 72° − 3° = 69°<br/><br/>
  <strong>True bearing = N 69°05''00″ E</strong>
</div>

<img src="/lessons/cls3/cls3_06_example2_handwork.svg" alt="Hand-worked solution for Example 2 showing secular variation update and declination subtraction" style="max-width:100%; margin:1rem 0;" />

<h3>Worked Example 3 — DMS Subtraction with Borrowing</h3>

<div style="background:#fffbeb; padding:1rem; border:1px solid #f59e0b; border-radius:6px; margin:1rem 0;">
  <strong>Given:</strong> Magnetic azimuth = 247°08''15″; Declination = 12°22''40″ West<br/>
  <strong>Find:</strong> True azimuth<br/><br/>
  <strong>Solution:</strong><br/>
  True = Magnetic − West Declination<br/>
  True = 247°08''15″ − 12°22''40″<br/><br/>
  <strong>Seconds:</strong> 15″ − 40″ → cannot subtract → borrow 1'' from 08'':<br/>
  &nbsp;&nbsp;Minutes become 07'', seconds become 15″ + 60″ = 75″<br/>
  &nbsp;&nbsp;75″ − 40″ = <strong>35″</strong><br/><br/>
  <strong>Minutes:</strong> 07'' − 22'' → cannot subtract → borrow 1° from 247°:<br/>
  &nbsp;&nbsp;Degrees become 246°, minutes become 07'' + 60'' = 67''<br/>
  &nbsp;&nbsp;67'' − 22'' = <strong>45''</strong><br/><br/>
  <strong>Degrees:</strong> 246° − 12° = <strong>234°</strong><br/><br/>
  <strong>True azimuth = 234°45''35″</strong>
</div>

<img src="/lessons/cls3/cls3_07_example3_handwork.svg" alt="Hand-worked solution for Example 3 showing DMS subtraction with double borrowing" style="max-width:100%; margin:1rem 0;" />

<h3>Worked Example 4 — Two-Step: Secular Variation + Application</h3>

<div style="background:#fffbeb; padding:1rem; border:1px solid #f59e0b; border-radius:6px; margin:1rem 0;">
  <strong>Given:</strong> 1978 declination = 7°45''30″ E; Annual change = 2''15″ W<br/>
  Magnetic azimuth (today, 2024) = 156°32''10″<br/>
  <strong>Find:</strong> Current declination, then true azimuth<br/><br/>
  <strong>Step 1 — Update declination:</strong><br/>
  Years elapsed = 2024 − 1978 = 46 years<br/>
  Annual change in seconds = 2''15″ = 135″<br/>
  Total change = 46 × 135″ = 6210″<br/>
  Convert: 6210″ ÷ 60 = 103''30″ = 1°43''30″ West<br/><br/>
  Since the annual change is westward, declination is becoming less east:<br/>
  Current declination = 7°45''30″ E − 1°43''30″<br/><br/>
  Seconds: 30″ − 30″ = 00″<br/>
  Minutes: 45'' − 43'' = 02''<br/>
  Degrees: 7° − 1° = 6°<br/><br/>
  Current declination = <strong>6°02''00″ East</strong><br/><br/>
  <strong>Step 2 — Apply to azimuth:</strong><br/>
  True = Magnetic + East Declination<br/>
  True = 156°32''10″ + 6°02''00″<br/><br/>
  Seconds: 10″ + 00″ = 10″<br/>
  Minutes: 32'' + 02'' = 34''<br/>
  Degrees: 156° + 6° = 162°<br/><br/>
  <strong>True azimuth = 162°34''10″</strong>
</div>

<img src="/lessons/cls3/cls3_08_example4_handwork.svg" alt="Hand-worked solution for Example 4 showing secular variation computation and azimuth correction" style="max-width:100%; margin:1rem 0;" />

<hr/>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- TOPIC 2 — SMARTPHONE COMPASS APPLICATIONS                         -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<h2>2. Smartphone Compass Applications</h2>

<p>While no smartphone app replaces a total station or survey-grade GNSS receiver, several apps turn your phone into a surprisingly capable <strong>reconnaissance tool</strong>. Two apps commonly used in surveying fieldwork are <strong>Hunter Pro Compass</strong> and <strong>Theodolite</strong>.</p>

<h3>Hunter Pro Compass</h3>

<p>Hunter Pro Compass is a popular smartphone compass app that provides:</p>

<ul>
  <li><strong>Magnetic and True azimuth</strong> displayed simultaneously — the app applies declination automatically using your GPS location</li>
  <li><strong>GPS coordinates</strong> (latitude/longitude) shown on-screen</li>
  <li><strong>Digital level bubbles</strong> — circular and linear levels help you hold the phone flat</li>
  <li><strong>Accuracy of ±0.5°</strong> under good conditions (no nearby magnetic interference)</li>
  <li><strong>Map view</strong> with your position and bearing line overlaid</li>
</ul>

<img src="/lessons/cls3/cls3_09_hunter_pro_compass_app.svg" alt="Hunter Pro Compass main screen showing MAG and TRUE azimuth readings, GPS coordinates, and level bubbles" style="max-width:100%; margin:1rem 0;" />

<img src="/lessons/cls3/cls3_10_hunter_pro_map_view.svg" alt="Hunter Pro Compass map view showing user position with bearing line overlaid on aerial imagery" style="max-width:100%; margin:1rem 0;" />

<p><strong>Field use:</strong> Hunter Pro is excellent for quick reconnaissance — checking the approximate bearing to a property corner, verifying which direction a boundary line runs before setting up the total station, or navigating to a control monument described in a record.</p>

<p><strong>Limitations:</strong> Like all smartphone compasses, Hunter Pro uses the phone''s magnetometer, which is easily disturbed by nearby metal objects, vehicles, power lines, and even the phone case. Always calibrate by moving the phone in a figure-8 pattern before use. Never rely on a phone compass for final survey measurements.</p>

<h3>Theodolite App</h3>

<p><strong>Theodolite</strong> is a more advanced app that combines the camera viewfinder with an augmented-reality (AR) overlay showing bearing, elevation angle, GPS position, and other data directly on the live camera image.</p>

<img src="/lessons/cls3/cls3_11_theodolite_geo_photo.svg" alt="Theodolite app geo-tagged photo showing AR overlay with bearing, elevation, and coordinates" style="max-width:100%; margin:1rem 0;" />

<h4>Key Features</h4>

<ul>
  <li><strong>Geo-tagged photos</strong> — every photo is stamped with GPS coordinates, bearing, elevation angle, date/time, and accuracy. Useful for documenting field conditions.</li>
  <li><strong>A-B measurement</strong> — capture Point A, then Point B, and the app computes the bearing and distance between them (using GPS), plus the horizontal and vertical angles.</li>
  <li><strong>Delta angle measurements</strong> — sight two targets and the app computes the angle between them, similar to turning an angle with a transit.</li>
  <li><strong>Range finder</strong> — estimate distance to a target of known height, or height of a target at known distance.</li>
</ul>

<img src="/lessons/cls3/cls3_12_theodolite_function_icons.svg" alt="Theodolite app function icons showing camera, A-B measurement, calculator, and settings" style="max-width:100%; margin:1rem 0;" />

<h4>The A-B Measurement Process</h4>

<ol>
  <li>Stand at Point A, aim the crosshair at your target, and tap <strong>Capture A</strong></li>
  <li>Walk to Point B, aim at the same (or a different) target, and tap <strong>Capture B</strong></li>
  <li>The app displays: bearing A→B, distance A→B (from GPS), elevation change, and delta angle</li>
</ol>

<img src="/lessons/cls3/cls3_13_theodolite_capture_pointA.svg" alt="Theodolite app capturing Point A with crosshair aimed at target and coordinates displayed" style="max-width:100%; margin:1rem 0;" />

<img src="/lessons/cls3/cls3_14_theodolite_capture_pointB.svg" alt="Theodolite app capturing Point B showing second position with distance and bearing computed" style="max-width:100%; margin:1rem 0;" />

<img src="/lessons/cls3/cls3_15_theodolite_delta_angles.svg" alt="Theodolite app delta angle result showing computed angle between two sighted targets" style="max-width:100%; margin:1rem 0;" />

<p><strong>Field use:</strong> Theodolite is valuable for documenting existing conditions — photographing utility poles, manholes, fences, and building corners with embedded coordinate/bearing data. The A-B measurement feature gives rough distances useful for planning traverse legs. The delta angle feature can verify angles as a field check.</p>

<p><strong>Important:</strong> Smartphone GPS accuracy is typically ±3 to ±5 meters horizontally. Distances computed from smartphone GPS are <em>not survey-grade</em>. Use these tools for reconnaissance and documentation only.</p>

<hr/>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- TOPIC 3 — FIELD NOTEKEEPING BEST PRACTICES                        -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<h2>3. Field Notekeeping Best Practices</h2>

<p>Your field book is the <strong>single most important product</strong> of any day in the field. Without accurate, complete, legible field notes, no computation can be trusted and no survey can be defended. Field notes are <strong>legal documents</strong> — they may be subpoenaed in court, presented as evidence in boundary disputes, or reviewed by the Texas Board of Professional Land Surveying in a complaint investigation.</p>

<div style="background:#fef2f2; padding:1rem; border-left:4px solid #dc2626; margin:1rem 0;">
  <strong>Legal Status of Field Notes:</strong> In Texas and most states, the field notes of a licensed surveyor are the <em>primary evidence</em> of what was measured and observed in the field. They take precedence over the final plat or map if a discrepancy exists. Altered or incomplete notes can be grounds for disciplinary action by the state board and can undermine a survey''s admissibility in court.
</div>

<h3>The Golden Rules of Field Notekeeping</h3>

<ol>
  <li><strong>NEVER erase.</strong> If you make an error, draw a single line through the incorrect entry so it remains legible, write the correct value beside or above it, and <strong>initial and date</strong> the correction. This preserves the integrity of the legal record.</li>
  <li><strong>Record at the time of measurement.</strong> Never rely on memory. Write values down immediately as they are observed or called out by the instrument operator.</li>
  <li><strong>Use a 4H pencil.</strong> Hard lead resists smudging in the field, survives rain and sweat, and produces a permanent mark. Never use ink (it smears when wet) or a soft pencil (it smudges).</li>
  <li><strong>Write on the RIGHT-hand page only</strong> for tabular data; use the LEFT-hand page for sketches, notes, and diagrams. This is the traditional surveyor''s field book convention.</li>
  <li><strong>Be complete.</strong> A stranger should be able to pick up your field book and reconstruct everything you did without asking you a single question.</li>
</ol>

<h3>Essential Field Book Components</h3>

<h4>Title Page</h4>
<p>The first page of every field book should contain: your name, company name, book number (if you use multiple books), start date, and contact information in case the book is lost.</p>

<h4>Table of Contents</h4>
<p>Maintain a running table of contents on the second and third pages. Each entry should list the project name, date, and page numbers. This allows you (or anyone) to quickly find data months or years later.</p>

<img src="/lessons/cls3/cls3_16_fieldbook_table_of_contents.svg" alt="Example field book table of contents showing project entries with dates and page numbers" style="max-width:100%; margin:1rem 0;" />

<h4>Legend and Symbols</h4>
<p>Include a legend page near the front of the book showing the symbols you use for common features. While standard symbols exist (see below), every surveyor should have a personal legend page in case their symbols vary slightly from the standard.</p>

<img src="/lessons/cls3/cls3_17_fieldbook_legend_symbols.svg" alt="Field book legend page showing custom symbols for traverse points, monuments, trees, utilities, and structures" style="max-width:100%; margin:1rem 0;" />

<h4>Standard Survey Symbols</h4>
<p>The following symbols are widely used in field sketches:</p>

<table>
<thead><tr><th>Symbol</th><th>Feature</th><th>Description</th></tr></thead>
<tbody>
<tr><td>□ (open square)</td><td>Traverse point</td><td>A point occupied by the instrument</td></tr>
<tr><td>■ (filled rectangle)</td><td>Building</td><td>Outline approximates the building footprint</td></tr>
<tr><td>✕ (crossed lines)</td><td>Pine/coniferous tree</td><td>The X represents the spreading branches</td></tr>
<tr><td>⊙ (scalloped circle)</td><td>Deciduous tree (oak, elm)</td><td>Wavy outline suggests the leaf canopy</td></tr>
<tr><td>▲ (triangle)</td><td>Fire hydrant</td><td>Small solid triangle at the location</td></tr>
<tr><td>—W—</td><td>Water line</td><td>Dashed line with W labels</td></tr>
<tr><td>—G—</td><td>Gas line</td><td>Dashed line with G labels</td></tr>
<tr><td>—S—</td><td>Sewer line</td><td>Dashed line with S labels</td></tr>
<tr><td>—E—</td><td>Electric line</td><td>Dashed line with E labels</td></tr>
<tr><td>—M—</td><td>Irrigation main</td><td>Dashed line with M labels</td></tr>
<tr><td>──┤├──</td><td>Fence</td><td>Line with cross-ties at regular intervals</td></tr>
</tbody>
</table>

<img src="/lessons/cls3/cls3_18_standard_survey_symbols.svg" alt="Standard survey symbols chart showing graphical representations for traverse points, buildings, vegetation types, fire hydrants, and utility lines" style="max-width:100%; margin:1rem 0;" />

<h4>Page Numbering</h4>
<p>Number every page in the <strong>upper-right corner of the right-hand page</strong>. Left-hand pages take the same number as their facing right-hand page. Sequential, unbroken page numbers prove that no pages have been removed — critical for the legal integrity of the book.</p>

<img src="/lessons/cls3/cls3_19_fieldbook_page_numbers.svg" alt="Field book showing proper page number placement in the upper-right corner of the right-hand page" style="max-width:100%; margin:1rem 0;" />

<h4>Date, Time, Weather, and Crew</h4>
<p>At the top of every new day''s work (and whenever conditions change significantly), record:</p>
<ul>
  <li><strong>Date</strong> — full date (e.g., 12-04-2025)</li>
  <li><strong>Time</strong> — start time for the session</li>
  <li><strong>Weather</strong> — temperature, cloud cover, wind, precipitation (affects atmospheric corrections and EDM accuracy)</li>
  <li><strong>Crew</strong> — names and roles of all field personnel</li>
</ul>

<img src="/lessons/cls3/cls3_20_fieldbook_date_weather.svg" alt="Field book header showing date, start time, weather conditions (sunny, 40°F), and crew names" style="max-width:100%; margin:1rem 0;" />

<h3>Field Sketches</h3>

<p>Every set of measurements should include a <strong>sketch</strong> on the left-hand page. Field sketches are <em>not</em> drawn to scale, but they should be <strong>proportional</strong> — a building that is twice as long as it is wide should look that way in your sketch.</p>

<p>Essential sketch elements:</p>
<ol>
  <li><strong>North arrow</strong> — always include a north arrow, even if approximate</li>
  <li><strong>Traverse lines</strong> — show the path of the survey with station labels</li>
  <li><strong>Adjacent features</strong> — buildings, roads, fences, trees, utilities</li>
  <li><strong>Dimensions and labels</strong> — label distances, angles, and feature names</li>
  <li><strong>Symbol legend</strong> — use standard symbols from your legend page</li>
</ol>

<img src="/lessons/cls3/cls3_21_fieldbook_sketch_example.svg" alt="Example field sketch showing a traverse through a campus with buildings, trees, fence lines, and traverse stations labeled with standard symbols" style="max-width:100%; margin:1rem 0;" />

<h3>Standard Lettering and Numbering</h3>

<p>Professional field notes use <strong>block lettering</strong> — upright, uniform capital letters formed with consistent stroke order. Neat lettering is not vanity; it prevents misreading values in the office. A poorly formed "5" that looks like a "3" can ruin an entire traverse computation.</p>

<p>Practice the standard stroke order for all letters A–Z and digits 0–9 until your lettering is automatic. Every surveying program in the country teaches this skill in the first week of field class.</p>

<img src="/lessons/cls3/cls3_22_standard_lettering_numbering.svg" alt="Standard block lettering and numbering chart showing proper stroke order for letters A through Z and digits 0 through 9" style="max-width:100%; margin:1rem 0;" />

<hr/>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- TOPIC 4 — SURVEY TRADE MAGAZINES                                   -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<h2>4. Survey Trade Magazines</h2>

<p>Professional development does not end with your degree. The surveying profession evolves constantly — new instruments, new software, new regulations, and new techniques. <strong>Trade magazines</strong> are the primary way working surveyors stay current.</p>

<h3>The American Surveyor</h3>

<p><strong>The American Surveyor</strong> (<em>amerisurv.com</em>) is a widely-read publication focused on the U.S. land surveying profession. It covers:</p>
<ul>
  <li>Field techniques and equipment reviews</li>
  <li>Boundary law and legal cases affecting surveyors</li>
  <li>State licensing updates and continuing education opportunities</li>
  <li>Historical articles on the development of the surveying profession</li>
  <li>Technology features on GNSS, UAV/drone surveying, 3D scanning, and GIS integration</li>
</ul>

<h3>xyHt</h3>

<p><strong>xyHt</strong> (<em>xyht.com</em>) — the name stands for the three coordinates x, y, and height — focuses on <strong>geospatial technology</strong> with coverage spanning surveying, mapping, positioning, and spatial data. Topics include:</p>
<ul>
  <li>Precision GNSS and RTK systems</li>
  <li>UAV/drone photogrammetry and LiDAR</li>
  <li>Machine control for construction</li>
  <li>BIM (Building Information Modeling) integration with survey data</li>
  <li>International geospatial projects and case studies</li>
</ul>

<h3>Other Valuable Resources</h3>

<table>
<thead><tr><th>Publication / Organization</th><th>Focus</th></tr></thead>
<tbody>
<tr><td><strong>Professional Surveyor Magazine</strong></td><td>General surveying practice, business management</td></tr>
<tr><td><strong>Point of Beginning (POB)</strong></td><td>Technology, field techniques, project showcases</td></tr>
<tr><td><strong>TSPS (Texas Society of Professional Surveyors)</strong></td><td>Texas-specific licensing, legislation, and continuing education</td></tr>
<tr><td><strong>NSPS (National Society of Professional Surveyors)</strong></td><td>National advocacy, standards, professional development</td></tr>
</tbody>
</table>

<p>As a student, start reading these publications now. Most offer free digital editions or newsletters. By the time you enter the profession, you will already have a working knowledge of current technology and industry trends that sets you apart from other entry-level candidates.</p>

<hr/>

<h2>Looking Ahead</h2>

<p>Next week we take the angles and distances you have been measuring and begin the mathematical process of computing coordinates. You will learn how to <strong>convert field angles to azimuths</strong>, compute <strong>latitudes and departures</strong>, and evaluate the <strong>error of closure</strong> in a traverse. This is where the algebra of surveying truly begins.</p>
',

resources = '[
  {"title":"NOAA Magnetic Declination Calculator","url":"https://www.ngdc.noaa.gov/geomag/calculators/magcalc.shtml","type":"reference"},
  {"title":"World Magnetic Model (WMM2025)","url":"https://www.ncei.noaa.gov/products/world-magnetic-model","type":"reference"},
  {"title":"Hunter Pro Compass App","url":"https://apps.apple.com/us/app/compass-pro/id1234567890","type":"app"},
  {"title":"Theodolite App by Hunter Research & Technology","url":"https://hunter.pทd/theodolite","type":"app"},
  {"title":"The American Surveyor","url":"https://amerisurv.com","type":"magazine"},
  {"title":"xyHt Magazine","url":"https://www.xyht.com","type":"magazine"}
]'::jsonb,

videos = '[
  {"title":"Magnetic Declination Explained","url":"https://www.youtube.com/watch?v=QJDg3UBv1Uw"},
  {"title":"How to Use a Compass: Declination","url":"https://www.youtube.com/watch?v=0cF0ovA3FtY"},
  {"title":"Theodolite App Tutorial","url":"https://www.youtube.com/watch?v=kGb8X8tRPnQ"}
]'::jsonb,

key_takeaways = ARRAY[
  'Magnetic declination is the angle between true north and magnetic north — uncorrected, it introduces significant position errors',
  'DMS arithmetic uses borrowing: 1° = 60 minutes, 1 minute = 60 seconds — apply the same borrow logic as base-60 subtraction',
  'Secular variation allows you to update historical declination values using a published annual change rate',
  'Smartphone compass apps like Hunter Pro and Theodolite are useful for reconnaissance but are NOT survey-grade instruments',
  'Field notes are legal documents that can be subpoenaed — never erase, always initial corrections, use a 4H pencil',
  'A complete field book includes title page, table of contents, legend, standard symbols, dated headers, and proportional sketches',
  'Trade magazines (The American Surveyor, xyHt) are essential for staying current with technology and professional standards'
]

WHERE id = 'acc03b03-0000-0000-0000-000000000001';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TOPICS
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM learning_topics WHERE lesson_id = 'acc03b03-0000-0000-0000-000000000001';

INSERT INTO learning_topics (id, lesson_id, title, content, order_index, keywords) VALUES

('acc03a03-0001-0000-0000-000000000001', 'acc03b03-0000-0000-0000-000000000001',
 'Magnetic Declination Review',
 'Magnetic declination is the angle between true (geographic) north and magnetic north at a given location and time. East declination means the compass needle points east of true north; west declination means it points west. The agonic line — where declination is zero — currently runs roughly from the Great Lakes through Florida. Declination changes over time due to secular variation: the slow, predictable annual shift in the Earth''s magnetic field. To update an old declination, multiply the annual change rate by the years elapsed and add algebraically to the original value. The current NOAA World Magnetic Model (WMM2025) provides declination for any coordinate. The master formula is True = Magnetic + East Declination (or − West Declination). Problems often require DMS arithmetic with borrowing, where 1° = 60 minutes and 1 minute = 60 seconds.',
 1,
 ARRAY['magnetic declination','true north','magnetic north','isogonic','agonic','secular variation','WMM','DMS arithmetic','borrowing','east declination','west declination','Polaris']),

('acc03a03-0002-0000-0000-000000000001', 'acc03b03-0000-0000-0000-000000000001',
 'Smartphone Compass Applications',
 'Modern smartphones contain magnetometers and GPS receivers that enable compass applications useful for survey reconnaissance. Hunter Pro Compass displays magnetic and true azimuth simultaneously by applying declination from the phone''s GPS position, and includes digital level bubbles and a map overlay. Its accuracy is approximately ±0.5° under good conditions. Theodolite is a more advanced app that overlays bearing, elevation angle, GPS coordinates, and accuracy on the live camera image, producing geo-tagged photos useful for documenting field conditions. Theodolite''s A-B measurement feature captures two positions and computes bearing and distance between them. Its delta angle function measures the angle between two sighted targets. Both apps are limited by smartphone GPS accuracy (±3–5 m) and magnetometer susceptibility to nearby metal, vehicles, and power lines. They are reconnaissance and documentation tools only — never survey-grade instruments.',
 2,
 ARRAY['smartphone','compass app','Hunter Pro','Theodolite','magnetometer','GPS','geo-tagged','reconnaissance','A-B measurement','delta angle','augmented reality']),

('acc03a03-0003-0000-0000-000000000001', 'acc03b03-0000-0000-0000-000000000001',
 'Field Notekeeping Best Practices',
 'Field notes are the single most important product of any field day and are legal documents admissible in court. In Texas, they serve as primary evidence of what was measured and observed, taking precedence over the final plat if a discrepancy exists. The golden rules: (1) never erase — draw a single line through errors, write the correct value, and initial/date the correction; (2) record at the time of measurement, never from memory; (3) use a 4H pencil (resists smudging, survives weather); (4) tabular data on the right-hand page, sketches on the left; (5) be complete enough that a stranger can reconstruct your work. A proper field book includes a title page, running table of contents, symbol legend, sequential page numbers (upper-right corner of right pages), and dated headers with time, weather, temperature, and crew names. Field sketches are proportional (not to scale), include a north arrow, show traverse lines with station labels, and use standard symbols for buildings, vegetation, utilities, and control points. Standard block lettering with consistent stroke order ensures legibility.',
 3,
 ARRAY['field notes','legal document','no erasures','4H pencil','field book','title page','table of contents','legend','symbols','page numbers','sketch','north arrow','block lettering','golden rules']),

('acc03a03-0004-0000-0000-000000000001', 'acc03b03-0000-0000-0000-000000000001',
 'Survey Trade Magazines',
 'Professional development is a career-long commitment in surveying. Trade magazines are the primary resource for staying current with technology, techniques, regulations, and industry trends. The American Surveyor (amerisurv.com) covers field techniques, equipment reviews, boundary law, state licensing updates, and historical articles about the profession. xyHt (xyht.com) focuses on geospatial technology including precision GNSS, UAV/drone photogrammetry, LiDAR, machine control, and BIM integration. Other valuable resources include Professional Surveyor Magazine, Point of Beginning (POB), the Texas Society of Professional Surveyors (TSPS) for state-specific licensing and legislation, and the National Society of Professional Surveyors (NSPS) for national advocacy and standards. Students should begin reading these publications early to build working knowledge of current technology and industry practice.',
 4,
 ARRAY['trade magazine','American Surveyor','xyHt','professional development','TSPS','NSPS','POB','continuing education','geospatial technology']);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. QUIZ QUESTIONS (16 questions — mixed types and difficulties)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM question_bank
WHERE lesson_id = 'acc03b03-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1341','week-3'];

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Q1  Multiple Choice  Easy
('What is the agonic line?',
 'multiple_choice',
 '["A line connecting points of equal declination","A line where magnetic declination is zero","The equator","A line of zero elevation"]'::jsonb,
 'A line where magnetic declination is zero',
 'The agonic line is the isogonic line along which declination equals zero — magnetic north and true north are the same direction. It currently runs approximately from the Great Lakes region through Florida. All other isogonic lines connect points of equal (but non-zero) declination.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','agonic','declination']),

-- Q2  True/False  Easy
('East declination means the compass needle points east of true north.',
 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'By definition, east declination means magnetic north (where the needle points) is east of true (geographic) north. The declination angle is measured from true north to magnetic north, and if magnetic north is to the east, the declination is designated east.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','east-declination']),

-- Q3  Multiple Choice  Easy
('Which pencil hardness is recommended for field notes?',
 'multiple_choice',
 '["2B (soft)","HB (medium)","4H (hard)","Mechanical pencil, any lead"]'::jsonb,
 '4H (hard)',
 'A 4H (hard) pencil is the standard for surveying field notes. Hard lead resists smudging from sweat and handling, survives rain better than soft lead, and produces a permanent mark. Soft pencils (2B, HB) smear easily, and ink runs when wet.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','field-notes','pencil']),

-- Q4  True/False  Easy
('Smartphone compass apps are accurate enough for final boundary surveys.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'Smartphone compass apps use the phone''s magnetometer, which has an accuracy of approximately ±0.5° to ±1° at best. This is far below the precision required for boundary surveys (which need angular accuracy of a few seconds). Additionally, smartphone GPS is only accurate to ±3–5 meters. These apps are useful for reconnaissance and documentation only.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','smartphone','accuracy']),

-- Q5  Multiple Choice  Medium
('A USGS topographic map from 1990 shows a declination of 8°30'' E with an annual change of 2'' W. What is the approximate declination in 2025?',
 'multiple_choice',
 '["7°20'' E","7°00'' E","9°40'' E","8°30'' E"]'::jsonb,
 '7°20'' E',
 'Years elapsed: 2025 − 1990 = 35 years. Total westward change: 35 × 2'' = 70'' = 1°10''. Since the change is westward, subtract from east declination: 8°30'' E − 1°10'' = 7°20'' E.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','secular-variation','declination']),

-- Q6  Multiple Choice  Medium
('When correcting an error in a field book, the proper procedure is to:',
 'multiple_choice',
 '["Erase the error completely and rewrite","Use correction fluid (white-out) and rewrite","Draw a single line through the error, write the correct value, initial and date it","Tear out the page and start fresh"]'::jsonb,
 'Draw a single line through the error, write the correct value, initial and date it',
 'The golden rule of field notes is NEVER erase. The original entry must remain legible under the single line-through. The correct value is written beside or above it. Initialing and dating the correction creates an audit trail. This practice preserves the legal integrity of the field book as a court-admissible document.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','field-notes','correction','legal']),

-- Q7  Multiple Choice  Medium
('The Hunter Pro Compass app simultaneously displays:',
 'multiple_choice',
 '["Only magnetic azimuth","Only true azimuth","Both magnetic and true azimuth plus GPS coordinates","Bearing in quadrant notation only"]'::jsonb,
 'Both magnetic and true azimuth plus GPS coordinates',
 'Hunter Pro Compass displays both MAG (magnetic) and TRUE azimuth on screen simultaneously, applying the declination correction automatically based on the phone''s GPS-derived location. It also shows GPS coordinates (lat/lon) and includes digital level bubbles.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','Hunter-Pro','smartphone']),

-- Q8  Multiple Choice  Medium
('Page numbers in a surveyor''s field book should be placed:',
 'multiple_choice',
 '["At the bottom center of every page","At the upper-right corner of the right-hand page only","At the top center of both pages","Anywhere convenient"]'::jsonb,
 'At the upper-right corner of the right-hand page only',
 'By convention, page numbers go in the upper-right corner of the right-hand page. The left-hand page (used for sketches) takes the same number as its facing right-hand page. Sequential, unbroken page numbers prove that no pages have been removed — essential for the legal integrity of the book.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','field-notes','page-numbers']),

-- Q9  Numeric Input  Medium
('A 1982 map shows a declination of 5°10'' E with an annual change of 3'' W. How many years until the declination becomes zero? Round to the nearest whole year.',
 'numeric_input',
 '[]'::jsonb,
 '103',
 'Initial declination = 5°10'' E = 310''. Annual change = 3'' W (decreasing eastward). Time to reach zero: 310'' ÷ 3''/year = 103.3 years ≈ 103 years.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','secular-variation','computation']),

-- Q10  Numeric Input  Medium
('Compute: 247°08''15" − 12°22''40". Give the degrees component only of the result.',
 'numeric_input',
 '[]'::jsonb,
 '234',
 'Seconds: 15" − 40" → borrow 1'' from 08'': seconds become 75", 75" − 40" = 35". Minutes: 07'' − 22'' → borrow 1° from 247°: minutes become 67'', 67'' − 22'' = 45''. Degrees: 246° − 12° = 234°. Full result: 234°45''35".',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','DMS-arithmetic','borrowing']),

-- Q11  Numeric Input  Hard
('A surveyor reads a magnetic azimuth of 312°15''20" in the field. The current declination is 4°38''45" East. What is the true azimuth? Give the minutes component only of the result.',
 'numeric_input',
 '[]'::jsonb,
 '54',
 'True = Magnetic + East Declination = 312°15''20" + 4°38''45". Seconds: 20" + 45" = 65" = 1''05". Minutes: 15'' + 38'' + 1'' (carry) = 54''. Degrees: 312° + 4° = 316°. True azimuth = 316°54''05". The minutes component is 54.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','declination','DMS','computation']),

-- Q12  Numeric Input  Hard
('In 1975, the declination at a site was 9°22''00" East, with an annual change of 2''30" West. What is the declination in 2025? Give your answer in total minutes (convert degrees to minutes and add). For example, 3°15'' = 195''.',
 'numeric_input',
 '[]'::jsonb,
 '437',
 'Years = 2025 − 1975 = 50. Total change = 50 × 2''30" = 50 × 150" = 7500" = 125'' = 2°05''. Since change is westward, subtract: 9°22'' − 2°05'' = 7°17'' E. In total minutes: 7 × 60 + 17 = 437''.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','secular-variation','hard','computation']),

-- Q13  Multiple Choice  Hard
('Which of the following Theodolite app features is MOST useful for documenting existing field conditions for a survey record?',
 'multiple_choice',
 '["Delta angle measurement","A-B distance measurement","Geo-tagged photos with bearing and coordinate overlay","Digital compass heading"]'::jsonb,
 'Geo-tagged photos with bearing and coordinate overlay',
 'Geo-tagged photos automatically embed GPS coordinates, bearing, elevation angle, date/time, and accuracy into the image metadata and as a visual overlay. This creates a permanent, verifiable record of field conditions at a specific location and time — exactly what is needed for documenting existing conditions. The other features are useful for reconnaissance but do not produce a permanent visual record.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','Theodolite','documentation']),

-- Q14  Essay  Hard
('Explain why surveying field notes are considered legal documents. Describe at least five essential components of a properly maintained field book, and explain the golden rule for correcting errors. What could happen to a surveyor whose field notes are found to be altered or incomplete during a court proceeding?',
 'essay',
 '[]'::jsonb,
 'Key points: Field notes are the original record of field measurements and observations. In Texas, they serve as primary evidence in boundary disputes and may be subpoenaed. They take precedence over the final plat if discrepancies exist. Essential components: (1) Title page with name, company, book number, date. (2) Table of contents listing projects, dates, page numbers. (3) Symbol legend for consistent interpretation. (4) Sequential page numbers proving no pages removed. (5) Date/time/weather/crew headers. (6) Proportional sketches with north arrow on left-hand pages. (7) Tabular measurement data on right-hand pages. Golden rule: NEVER erase — draw a single line through errors (keeping them legible), write correct value beside, initial and date correction. Consequences of altered/incomplete notes: the survey may be ruled inadmissible as evidence, the surveyor may face disciplinary action from the Texas Board of Professional Land Surveying (potentially suspension or revocation of license), and the surveyor may be liable for damages in civil litigation.',
 'A complete answer addresses legal status, lists at least five components with their purpose, correctly states the no-erase rule, and discusses professional consequences.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','essay','field-notes','legal']),

-- Q15  Essay  Medium
('Describe the two-step process for applying a historical declination value to a current magnetic bearing. Your answer should include: (a) how to update the old declination using secular variation, and (b) how to apply the updated declination to convert a magnetic bearing to a true bearing. Use a specific numerical example to illustrate your answer.',
 'essay',
 '[]'::jsonb,
 'Key points: Step 1 — Compute current declination: find years elapsed (current year minus map year), multiply by annual change rate, and add algebraically to original declination (eastward change reduces west declination and increases east declination; westward change does the opposite). Step 2 — Apply to bearing: True = Magnetic + East Declination or True = Magnetic − West Declination. Example: 1985 declination = 4°15'' W, annual change = 1''30" E. Years = 40. Total change = 40 × 90" = 3600" = 1°00'' E. Current = 4°15'' W − 1°00'' = 3°15'' W. If magnetic bearing = N 72°20'' E, then True = N 72°20'' E − 3°15'' = N 69°05'' E.',
 'A strong answer clearly separates the two steps, uses correct sign conventions, and includes a worked numerical example with proper DMS notation.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','essay','declination','secular-variation']),

-- Q16  True/False  Medium
('In a surveyor''s field book, the left-hand page is reserved for tabular measurement data and the right-hand page is for sketches.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'It is the opposite: the RIGHT-hand page is for tabular data (measurements, angles, distances) and the LEFT-hand page is for sketches, notes, and diagrams. This is the traditional convention in surveying field books.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','field-notes','convention']);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. PRACTICE PROBLEMS (20 problems)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- ── Declination Application (8 problems) ──────────────────────────────────

-- P1
('Practice: The magnetic bearing of a property line is N 35°20''00" E. The declination is 4°10''00" East. What is the true bearing? Express in DMS.',
 'short_answer', '[]'::jsonb,
 'N 39°30''00" E',
 'True = Magnetic + East Declination. 35°20''00" + 4°10''00" = 39°30''00". True bearing = N 39°30''00" E.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','declination','east']),

-- P2
('Practice: The magnetic azimuth of a line is 156°45''30". The declination is 7°20''15" West. What is the true azimuth?',
 'short_answer', '[]'::jsonb,
 '149°25''15"',
 'True = Magnetic − West Declination. 156°45''30" − 7°20''15": Seconds: 30" − 15" = 15". Minutes: 45'' − 20'' = 25''. Degrees: 156° − 7° = 149°. True azimuth = 149°25''15".',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','declination','west']),

-- P3
('Practice: Compute 183°12''08" + 9°53''47". Give the full DMS result.',
 'short_answer', '[]'::jsonb,
 '193°05''55"',
 'Seconds: 08" + 47" = 55". Minutes: 12'' + 53'' = 65'' = 1°05''. Degrees: 183° + 9° + 1° = 193°. Result = 193°05''55".',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','DMS-addition']),

-- P4
('Practice: The magnetic bearing of a fence line is S 48°15''00" W. The declination is 2°45''00" East. What is the true bearing? (Hint: convert to azimuth first, apply declination, convert back.)',
 'short_answer', '[]'::jsonb,
 'S 51°00''00" W',
 'Convert bearing to azimuth: S 48°15'' W = 180° + 48°15'' = 228°15''. Apply east declination: True azimuth = 228°15'' + 2°45'' = 231°00''. Convert back to bearing: 231° is in the SW quadrant (180°–270°), so 231° − 180° = 51°. True bearing = S 51°00''00" W.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','declination','bearing-conversion']),

-- P5
('Practice: Subtract 15°48''52" from 42°13''20". Show the full DMS result using borrowing.',
 'short_answer', '[]'::jsonb,
 '26°24''28"',
 'Seconds: 20" − 52" → borrow 1'' from 13'': minutes become 12'', seconds become 80". 80" − 52" = 28". Minutes: 12'' − 48'' → borrow 1° from 42°: degrees become 41°, minutes become 72''. 72'' − 48'' = 24''. Degrees: 41° − 15° = 26°. Result = 26°24''28".',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','DMS-subtraction','borrowing']),

-- P6
('Practice: A magnetic azimuth reads 87°04''10". The declination is 13°15''50" East. What is the true azimuth?',
 'short_answer', '[]'::jsonb,
 '100°20''00"',
 'True = Magnetic + East Declination. Seconds: 10" + 50" = 60" = 1''00". Minutes: 04'' + 15'' + 1'' (carry) = 20''. Degrees: 87° + 13° = 100°. True azimuth = 100°20''00".',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','declination','carry']),

-- P7
('Practice: True azimuth = 320°00''00", declination = 5°12''30" East. What was the magnetic azimuth the compass actually read?',
 'short_answer', '[]'::jsonb,
 '314°47''30"',
 'Rearrange: Magnetic = True − East Declination. 320°00''00" − 5°12''30": Seconds: 00" − 30" → borrow: 60" − 30" = 30". Minutes: 59'' − 12'' = 47'' (after borrow from degrees). Wait: 00'' − 1'' (borrow for seconds) = need to borrow from degrees first. 320°00''00" → 319°59''60". 319°59''60" − 5°12''30": 60" − 30" = 30". 59'' − 12'' = 47''. 319° − 5° = 314°. Result = 314°47''30".',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','declination','reverse','borrowing']),

-- P8
('Practice: A magnetic bearing of N 60°00''00" E is observed. The declination is 3°00''00" West. A second line has a magnetic bearing of S 25°00''00" W with the same declination. Find the true bearing of both lines.',
 'short_answer', '[]'::jsonb,
 'N 57°00''00" E and S 22°00''00" W',
 'Line 1: True = N (60°00'' − 3°00'') E = N 57°00'' E (west declination subtracted from NE bearing). Line 2: True = S (25°00'' − 3°00'') W = S 22°00'' W (same logic for SW bearing — west declination reduces the angle from the meridian in all quadrants when applying consistently via azimuths).',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','declination','two-lines']),

-- ── Secular Variation (4 problems) ────────────────────────────────────────

-- P9
('Practice: A 1990 USGS quad shows declination = 6°00'' E, annual change = 4'' W. What is the declination in 2025?',
 'short_answer', '[]'::jsonb,
 '3°40'' E',
 'Years = 35. Total change = 35 × 4'' = 140'' = 2°20'' W. Current = 6°00'' E − 2°20'' = 3°40'' E.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','secular-variation']),

-- P10
('Practice: In 1970, the declination was 2°30'' W with an annual change of 1'' E. (a) In what year did the declination become zero? (b) What is the declination in 2025?',
 'short_answer', '[]'::jsonb,
 '(a) 2120; (b) 1°35'' W',
 '(a) 2°30'' W = 150''. At 1''/year eastward, time to reach zero = 150 / 1 = 150 years → 1970 + 150 = year 2120. (b) From 1970 to 2025 = 55 years. Change = 55 × 1'' E = 55''. Current = 150'' W − 55'' = 95'' W = 1°35'' W. The declination is still west because only 55 of the 150 years needed to reach zero have elapsed.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','secular-variation','zero-crossing']),

-- P11
('Practice: A site had 11°05'' E declination in 1960. The annual change is 3''30" W. What is the declination in 2025? Express in degrees and minutes.',
 'short_answer', '[]'::jsonb,
 '7°17''30" E',
 'Years = 65. Annual change = 3''30" = 210". Total change = 65 × 210" = 13650" = 227''30" = 3°47''30" W. Current = 11°05''00" − 3°47''30": Seconds: 00" − 30" → borrow → 60" − 30" = 30", minutes 04''. Minutes: 04'' − 47'' → borrow → 64'' − 47'' = 17'', degrees 10°. Degrees: 10° − 3° = 7°. Result = 7°17''30" E.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','secular-variation','DMS']),

-- P12
('Practice: How many years would it take for a declination of 8°15'' East to become 0° if the annual change is 5'' West?',
 'numeric_input', '[]'::jsonb,
 '99',
 '8°15'' = 495''. Rate = 5''/year west. Time = 495 / 5 = 99 years.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','secular-variation','computation']),

-- ── Two-Step Problems (4 problems) ────────────────────────────────────────

-- P13
('Practice: A 1980 map shows declination = 10°30'' E, annual change = 2'' W. A surveyor in 2025 reads a magnetic azimuth of 215°40''00". Find the true azimuth.',
 'short_answer', '[]'::jsonb,
 '224°40''00"',
 'Years = 45. Change = 45 × 2'' = 90'' = 1°30'' W. Current declination = 10°30'' − 1°30'' = 9°00'' E. True = 215°40''00" + 9°00''00" = 224°40''00".',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','two-step','azimuth']),

-- P14
('Practice: In 1995, declination = 3°45'' W, annual change = 6'' W. Magnetic bearing in 2025 = N 80°00'' E. Find the true bearing.',
 'short_answer', '[]'::jsonb,
 'N 73°15'' E',
 'Years = 30. Change = 30 × 6'' = 180'' = 3°00'' W. Current = 3°45'' W + 3°00'' W = 6°45'' W (declination has increased westward). True = Magnetic − West Declination = N 80°00'' E − 6°45''. Minutes: 00'' − 45'' → borrow 1° → 60'' − 45'' = 15''. Degrees: 79° − 6° = 73°. True bearing = N 73°15'' E.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','two-step','bearing']),

-- P15
('Practice: A 1978 declination is 7°45''30" E, annual change is 2''15" W. Find the true azimuth in 2024 if magnetic azimuth = 156°32''10".',
 'short_answer', '[]'::jsonb,
 '162°34''10"',
 'Years = 46. Change = 46 × 135" = 6210" = 103''30" = 1°43''30" W. Current = 7°45''30" E − 1°43''30" = 6°02''00" E. True = 156°32''10" + 6°02''00" = 162°34''10".',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','two-step','DMS']),

-- P16
('Practice: A 2000 map shows declination = 1°15'' E, annual change = 4'' E. A surveyor in 2025 reads magnetic bearing S 30°00'' E. Find the true bearing.',
 'short_answer', '[]'::jsonb,
 'S 27°05'' E',
 'Years = 25. Change = 25 × 4'' E = 100'' = 1°40'' E. Current = 1°15'' E + 1°40'' E = 2°55'' E. Convert bearing to azimuth: S 30°00'' E = 180° − 30° = 150°. True azimuth = 150° + 2°55'' = 152°55''. Convert back: 152°55'' is in the SE quadrant (90°–180°). Bearing = 180° − 152°55'' = 27°05''. True bearing = S 27°05'' E.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','two-step','SE-quadrant']),

-- ── Field Notes & Symbols (4 problems) ────────────────────────────────────

-- P17
('Practice: You are starting a new field book. List, in order, the five items that should appear on the first few pages before any field data is recorded.',
 'essay', '[]'::jsonb,
 '(1) Title page — name, company, book number, start date, contact info. (2) Table of contents — maintained as a running index of projects, dates, and page numbers. (3) Symbol legend — standard and personal symbols used in sketches. (4) Instrument list — serial numbers and calibration dates of equipment used. (5) General notes — project-specific standards, datum, coordinate system, or client requirements.',
 'A complete answer lists at least title page, table of contents, and symbol legend as the first three items.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','field-notes','setup']),

-- P18
('Practice: Match each symbol with the feature it represents: (a) □  (b) ✕  (c) ■  (d) ⊙  (e) ▲',
 'multiple_choice',
 '["(a)Building (b)Pine tree (c)Traverse point (d)Oak tree (e)Fire hydrant","(a)Traverse point (b)Pine tree (c)Building (d)Deciduous tree (e)Fire hydrant","(a)Traverse point (b)Intersection (c)Building (d)Benchmark (e)Monument","(a)Control point (b)Cross-tie (c)Building (d)Manhole (e)Utility pole"]'::jsonb,
 '(a)Traverse point (b)Pine tree (c)Building (d)Deciduous tree (e)Fire hydrant',
 'Standard survey symbols: □ = traverse point (open square marks an occupied station), ✕ = pine/coniferous tree (crossed lines suggest spreading branches), ■ = building (filled rectangle approximates footprint), ⊙ = deciduous tree like oak or elm (scalloped circle suggests leaf canopy), ▲ = fire hydrant (small solid triangle).',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','symbols','identification']),

-- P19
('Practice: A surveyor erases an incorrect distance value in their field book and rewrites the correct number. During a court proceeding, opposing counsel notices the erasure. What are the potential consequences for the surveyor and the survey?',
 'essay', '[]'::jsonb,
 'Key consequences: (1) The field book''s integrity as a legal document is compromised — the erasure suggests possible falsification. (2) The specific measurement, and potentially all measurements in the book, may be ruled inadmissible as evidence. (3) The surveyor may face disciplinary action from the state licensing board (Texas TBPLS) including reprimand, suspension, or license revocation. (4) The survey results based on those notes may be invalidated, requiring a complete resurvey at the surveyor''s expense. (5) The surveyor''s professional reputation and credibility as an expert witness are damaged. The proper procedure was to draw a single line through the error, write the correct value, and initial/date the correction.',
 'A strong answer identifies legal, professional, and practical consequences and contrasts with the proper correction procedure.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','field-notes','legal','erasure']),

-- P20
('Practice: Sketch a field note page header for a boundary survey conducted on March 15, 2025. The weather is partly cloudy, 72°F, with a light south wind. The crew consists of you (rod person), Maria Chen (instrument operator), and James Wright (party chief). Include all required elements.',
 'essay', '[]'::jsonb,
 'Required elements in the header: (1) Date: March 15, 2025 (or 03-15-2025). (2) Time: start time (e.g., 8:00 AM). (3) Project name/description: Boundary survey + client name or job number. (4) Weather: Partly cloudy, 72°F, light S wind. (5) Crew: Party Chief — James Wright; Instrument Operator — Maria Chen; Rod Person — [student name]. (6) Equipment: instrument model and serial number. (7) Page number in upper-right corner.',
 'A complete header includes date, time, project identification, weather details (cloud cover, temperature, wind), full crew list with roles, and page number.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','field-notes','header','sketch']);


-- ────────────────────────────────────────────────────────────────────────────
-- 5. FLASHCARDS (25)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM flashcards WHERE lesson_id = 'acc03b03-0000-0000-0000-000000000001';

INSERT INTO flashcards (id, term, definition, hint_1, hint_2, hint_3, module_id, lesson_id, keywords, tags, category) VALUES

('fc030001-0000-0000-0000-000000000001',
 'Magnetic Declination',
 'The angle between true (geographic) north and magnetic north at a given location and time. East declination: needle points east of true north. West declination: needle points west of true north. Varies by location and changes slowly over time (secular variation).',
 'It is the reason a compass does not point to true north',
 'Also called "variation" in older texts and nautical usage',
 'In Texas, it is approximately 2°–5° East (as of 2025)',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['declination','magnetic north','true north','variation'],
 ARRAY['acc-srvy-1341','week-3','declination'], 'surveying'),

('fc030002-0000-0000-0000-000000000001',
 'Isogonic Lines',
 'Lines on a map connecting points of equal magnetic declination. Published on NOAA charts and USGS topographic maps. The agonic line is the special isogonic line where declination equals zero.',
 'Iso = equal, gonic = angle',
 'Similar concept to contour lines (equal elevation) and isotherms (equal temperature)',
 'They shift over time as the magnetic field changes',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['isogonic','agonic','equal declination','map','NOAA'],
 ARRAY['acc-srvy-1341','week-3','declination'], 'surveying'),

('fc030003-0000-0000-0000-000000000001',
 'Agonic Line',
 'The isogonic line along which magnetic declination is zero — magnetic north equals true north. Currently runs approximately from the Great Lakes region through Florida in the United States. Its position shifts over time.',
 'A = without, gonic = angle → no declination angle',
 'If you stand on this line, your compass points to true north',
 'It divides the US into east declination (west of the line) and west declination (east of the line)',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['agonic','zero declination','Great Lakes','Florida'],
 ARRAY['acc-srvy-1341','week-3','declination'], 'surveying'),

('fc030004-0000-0000-0000-000000000001',
 'Secular Variation',
 'The slow, predictable annual change in magnetic declination at a given location, caused by changes in the Earth''s liquid outer core. Expressed as an annual rate (e.g., 2'' W per year). Used to update historical declination values to the present.',
 'Secular means long-term or slow-changing',
 'Typical rates are 1'' to 6'' per year in the continental US',
 'Formula: Current decl. = Old decl. + (years × annual change)',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['secular variation','annual change','magnetic field','update declination'],
 ARRAY['acc-srvy-1341','week-3','declination'], 'surveying'),

('fc030005-0000-0000-0000-000000000001',
 'True Bearing Formula',
 'True Bearing = Magnetic Bearing + East Declination, or True Bearing = Magnetic Bearing − West Declination. Concisely: True = Magnetic + Declination (east positive, west negative). This converts what the compass reads to the actual direction from true north.',
 'East declination is added; West is subtracted',
 'Think: "East is positive, West is negative"',
 'The same formula works for azimuths: True Az = Magnetic Az ± Declination',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['true bearing','magnetic bearing','formula','east','west','declination'],
 ARRAY['acc-srvy-1341','week-3','declination','formula'], 'surveying'),

('fc030006-0000-0000-0000-000000000001',
 'WMM2025 (World Magnetic Model)',
 'The current mathematical model of Earth''s magnetic field, published jointly by NOAA and the British Geological Survey. Updated every 5 years. Provides declination, inclination, and field intensity for any location on Earth. Available via NOAA''s online calculator.',
 'WMM stands for World Magnetic Model',
 'Updated every 5 years — current version covers 2025–2030',
 'Used by GPS devices, smartphones, and military systems worldwide',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['WMM','WMM2025','NOAA','magnetic model','declination calculator'],
 ARRAY['acc-srvy-1341','week-3','declination'], 'surveying'),

('fc030007-0000-0000-0000-000000000001',
 'DMS Arithmetic — Borrowing Rule',
 'When subtracting DMS values, if seconds < 0, borrow 1'' (= 60") from minutes. If minutes < 0, borrow 1° (= 60'') from degrees. Same logic as base-10 borrowing but using base-60. Example: 42°13''20" − 15°48''52" → borrow to get 41°72''80" − 15°48''52" = 26°24''28".',
 '1 degree = 60 minutes; 1 minute = 60 seconds',
 'Always start from seconds, then minutes, then degrees — right to left like regular subtraction',
 'If the result of any column is negative, borrow from the next larger unit',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['DMS','borrowing','subtraction','degrees','minutes','seconds','base-60'],
 ARRAY['acc-srvy-1341','week-3','declination','computation'], 'surveying'),

('fc030008-0000-0000-0000-000000000001',
 'DMS Arithmetic — Carrying Rule',
 'When adding DMS values, if seconds ≥ 60, subtract 60" and carry 1'' to minutes. If minutes ≥ 60, subtract 60'' and carry 1° to degrees. Example: 183°12''08" + 9°53''47" → seconds 55", minutes 65'' → carry → 193°05''55".',
 'If seconds total 60 or more, convert 60" to 1 minute',
 'If minutes total 60 or more, convert 60'' to 1 degree',
 'Work right to left: seconds first, then minutes, then degrees',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['DMS','carrying','addition','degrees','minutes','seconds'],
 ARRAY['acc-srvy-1341','week-3','declination','computation'], 'surveying'),

('fc030009-0000-0000-0000-000000000001',
 'Hunter Pro Compass App',
 'A smartphone compass app that displays both magnetic and true azimuth simultaneously by applying declination from the phone''s GPS location. Features include digital level bubbles, GPS coordinates, and a map overlay. Accuracy: ±0.5° under good conditions. Used for reconnaissance and quick field checks — not survey-grade.',
 'Shows MAG and TRUE readings at the same time',
 'Uses the phone''s magnetometer and GPS together',
 'Accuracy of ±0.5° is about 1800 times worse than a 1" total station',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['Hunter Pro','smartphone','compass app','magnetometer','GPS','reconnaissance'],
 ARRAY['acc-srvy-1341','week-3','smartphone'], 'surveying'),

('fc030010-0000-0000-0000-000000000001',
 'Theodolite App',
 'An advanced smartphone app that overlays bearing, elevation angle, GPS coordinates, and accuracy on the live camera image (augmented reality). Produces geo-tagged photos for documenting field conditions. Features A-B measurement (distance between two GPS-captured points) and delta angle measurement (angle between two sighted targets).',
 'Uses augmented reality to overlay data on the camera view',
 'Geo-tagged photos embed coordinates, bearing, and time in the image',
 'The A-B feature uses GPS, so distances are only accurate to ±3–5 meters',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['Theodolite','augmented reality','geo-tagged','A-B measurement','delta angle','smartphone'],
 ARRAY['acc-srvy-1341','week-3','smartphone'], 'surveying'),

('fc030011-0000-0000-0000-000000000001',
 'Smartphone Compass Limitations',
 'Smartphone compasses use a magnetometer that is easily disturbed by nearby metal objects, vehicles, power lines, and even phone cases. GPS accuracy is only ±3–5 meters horizontally. Magnetometer accuracy is ±0.5° to ±1° at best. These tools are for reconnaissance and documentation only — never for final survey measurements.',
 'Calibrate by moving phone in a figure-8 pattern before use',
 'Stay away from vehicles and metal structures while taking readings',
 'Compare: total station = ±1" to ±5"; smartphone = ±0.5° (= ±1800")',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['smartphone','limitations','magnetometer','accuracy','GPS','metal interference'],
 ARRAY['acc-srvy-1341','week-3','smartphone'], 'surveying'),

('fc030012-0000-0000-0000-000000000001',
 'Field Notes as Legal Documents',
 'In Texas and most states, surveying field notes are legal documents that may be subpoenaed in court. They serve as the primary evidence of what was measured and observed in the field. If a discrepancy exists between field notes and the final plat, the field notes take precedence. Altered or incomplete notes can lead to disciplinary action and loss of license.',
 'Field notes can be subpoenaed — they must be court-ready at all times',
 'They take precedence over the final plat or map',
 'Tampering can result in license suspension or revocation',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['legal document','field notes','subpoena','court','evidence','plat'],
 ARRAY['acc-srvy-1341','week-3','field-notes'], 'surveying'),

('fc030013-0000-0000-0000-000000000001',
 'Golden Rule: Never Erase',
 'The most important rule of field notekeeping: NEVER erase an entry. If an error is made, draw a single line through the incorrect value (keeping it legible), write the correct value beside or above it, and initial and date the correction. This preserves the legal integrity and chain of evidence in the field book.',
 'A single line through — not scribbled out, not whited out',
 'The original value must remain readable under the line',
 'Initial AND date every correction',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['never erase','golden rule','single line','initial','correction','legal integrity'],
 ARRAY['acc-srvy-1341','week-3','field-notes'], 'surveying'),

('fc030014-0000-0000-0000-000000000001',
 '4H Pencil',
 'The standard writing instrument for surveying field notes. The hard lead (4H on the pencil hardness scale) resists smudging from handling and sweat, survives rain better than soft graphite, and produces a permanent, legible mark. Never use ink (smears when wet) or soft pencils (smudge easily) for field notes.',
 'H = Hard; the higher the number, the harder the lead',
 '4H is near the hard end of the scale (9H is hardest)',
 'Soft pencils like 2B are for drawing/art, not field notes',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['4H','pencil','hard lead','field notes','smudge resistant'],
 ARRAY['acc-srvy-1341','week-3','field-notes'], 'surveying'),

('fc030015-0000-0000-0000-000000000001',
 'Field Book Layout Convention',
 'In the traditional surveyor''s field book: the RIGHT-hand page is for tabular measurement data (angles, distances, coordinates) and the LEFT-hand page is for sketches, diagrams, and narrative notes. This convention has been standard for over a century and is expected in professional practice.',
 'Right = numbers and data; Left = pictures and notes',
 'Think: "write right" for writing data',
 'Left-hand pages face the right-hand pages so sketches illustrate the data',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['field book','right-hand page','left-hand page','convention','layout'],
 ARRAY['acc-srvy-1341','week-3','field-notes'], 'surveying'),

('fc030016-0000-0000-0000-000000000001',
 'Field Book Title Page',
 'The first page of every field book. Contains: surveyor''s name, company/employer name, book number (if multiple books are used), start date, and contact information in case the book is lost. Establishes ownership and professional accountability for the notes.',
 'Always the FIRST page — before any data',
 'Include contact info for lost-book recovery',
 'Numbering books (Book 1, Book 2, ...) creates a traceable sequence',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['title page','field book','name','company','book number','date'],
 ARRAY['acc-srvy-1341','week-3','field-notes'], 'surveying'),

('fc030017-0000-0000-0000-000000000001',
 'Table of Contents (Field Book)',
 'A running index maintained on the second and third pages of the field book. Each entry lists the project name, date, and page numbers where the data begins. Allows anyone to quickly locate specific project data months or years after it was recorded. Updated every time a new project or survey day begins.',
 'Maintained on pages 2–3, right after the title page',
 'Update it every time you start a new project entry',
 'Without a TOC, finding data in a full field book is nearly impossible',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['table of contents','TOC','index','field book','organization'],
 ARRAY['acc-srvy-1341','week-3','field-notes'], 'surveying'),

('fc030018-0000-0000-0000-000000000001',
 'Standard Survey Symbols',
 'A set of universally recognized symbols used in field sketches: □ = traverse point (instrument station), ■ = building, ✕ = pine/coniferous tree, ⊙ = deciduous tree (oak, elm), ▲ = fire hydrant. Utility lines use dashed lines with letter labels: —W— (water), —G— (gas), —S— (sewer), —E— (electric), —M— (irrigation).',
 '□ open square = traverse point; ■ filled = building',
 '✕ crossed lines = pine tree; ⊙ scalloped = oak tree',
 'Utility lines: letter between dashes tells you the type',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['symbols','traverse point','building','tree','fire hydrant','utility lines','sketch'],
 ARRAY['acc-srvy-1341','week-3','field-notes','symbols'], 'surveying'),

('fc030019-0000-0000-0000-000000000001',
 'Field Sketch Requirements',
 'Field sketches go on the left-hand page. They must be proportional (not to scale) and include: (1) north arrow, (2) traverse lines with station labels, (3) adjacent features (buildings, roads, fences, trees), (4) dimensions and labels, and (5) standard symbols. A good sketch lets someone who was not in the field understand the site layout.',
 'NOT to scale, but proportional — a 200-ft building should look twice as long as a 100-ft building',
 'Always include a north arrow — even if approximate',
 'Use standard symbols from your legend page',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['field sketch','proportional','north arrow','left-hand page','labels','features'],
 ARRAY['acc-srvy-1341','week-3','field-notes','sketch'], 'surveying'),

('fc030020-0000-0000-0000-000000000001',
 'Page Numbering (Field Book)',
 'Pages are numbered sequentially in the upper-right corner of the RIGHT-hand page only. Left-hand pages take the same number as their facing right-hand page. Sequential, unbroken page numbers prove that no pages have been torn out — essential for legal integrity.',
 'Upper-right corner of right-hand pages only',
 'Left page shares the number of its facing right page',
 'Missing numbers suggest pages were removed — destroys legal credibility',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['page numbers','upper-right','right-hand page','sequential','legal integrity'],
 ARRAY['acc-srvy-1341','week-3','field-notes'], 'surveying'),

('fc030021-0000-0000-0000-000000000001',
 'Block Lettering',
 'The standard lettering style for surveying field notes. Upright, uniform capital letters formed with a consistent stroke order. Ensures legibility and prevents misreading critical values (e.g., a poorly formed "5" that looks like "3" could ruin a computation). Practiced with stroke-order charts until automatic.',
 'Always CAPITAL letters — no cursive or lowercase',
 'Uniform height and spacing across the page',
 'Practice stroke order for every letter and digit until automatic',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['block lettering','capital letters','stroke order','legibility','uniform'],
 ARRAY['acc-srvy-1341','week-3','field-notes'], 'surveying'),

('fc030022-0000-0000-0000-000000000001',
 'Date/Weather/Crew Header',
 'At the top of every new day''s work, record: date (full), start time, weather conditions (temperature, cloud cover, wind, precipitation), and crew members with their roles (party chief, instrument operator, rod person, etc.). Weather affects atmospheric corrections for EDM distances.',
 'Record weather because it affects EDM atmospheric corrections',
 'Include all crew names — this establishes who was responsible for what',
 'Update the header whenever conditions change significantly',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['date','weather','crew','header','temperature','field notes'],
 ARRAY['acc-srvy-1341','week-3','field-notes'], 'surveying'),

('fc030023-0000-0000-0000-000000000001',
 'The American Surveyor',
 'A widely-read U.S. trade publication (amerisurv.com) covering field techniques, equipment reviews, boundary law, state licensing updates, historical articles, and technology features on GNSS, drones, 3D scanning, and GIS. Essential reading for professional development and staying current with industry trends.',
 'Available at amerisurv.com — much content is free online',
 'Covers both traditional surveying and emerging technology',
 'Includes articles on boundary law relevant to practicing surveyors',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['American Surveyor','trade magazine','professional development','equipment review'],
 ARRAY['acc-srvy-1341','week-3','trade-magazines'], 'surveying'),

('fc030024-0000-0000-0000-000000000001',
 'xyHt Magazine',
 'A geospatial technology publication (xyht.com) — the name stands for x, y, and height coordinates. Covers precision GNSS/RTK, UAV/drone photogrammetry, LiDAR, machine control, and BIM integration. More technology-focused than The American Surveyor, with international project coverage.',
 'x, y, H(eight) = the three spatial coordinates',
 'Strong focus on drone, LiDAR, and GNSS technology',
 'Covers international projects, not just U.S. surveying',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['xyHt','geospatial','technology','GNSS','drone','LiDAR','BIM'],
 ARRAY['acc-srvy-1341','week-3','trade-magazines'], 'surveying'),

('fc030025-0000-0000-0000-000000000001',
 'TSPS (Texas Society of Professional Surveyors)',
 'The professional organization for licensed surveyors in Texas. Provides Texas-specific resources including licensing guidance, legislative updates affecting the profession, continuing education opportunities, and networking. Membership is valuable for any surveyor practicing in Texas.',
 'Texas-specific — covers state licensing and legislation',
 'Offers continuing education required to maintain your Texas license',
 'NSPS is the national equivalent (National Society of Professional Surveyors)',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 ARRAY['TSPS','Texas','professional society','licensing','continuing education','NSPS'],
 ARRAY['acc-srvy-1341','week-3','trade-magazines'], 'surveying');

COMMIT;
