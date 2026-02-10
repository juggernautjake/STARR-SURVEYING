-- ============================================================================
-- STARR Surveying — Article Seed: Development of the Survey Chain
-- ============================================================================
-- Author: Milton Denny
-- Article: "Development of the Survey Chain" / "Abraham Lincoln's Chain"
-- Linked as required reading for SRVY 1341, Lesson 2 (Traverse Types & Planning)
--
-- Article UUID: a1100001-0000-0000-0000-000000000001
-- Module UUID:  acc00003-0000-0000-0000-000000000003  (SRVY 1341)
-- Lesson UUID:  acc03b02-0000-0000-0000-000000000001  (Lesson 2)
--
-- Run AFTER supabase_schema.sql + supabase_migration_articles.sql
-- Safe to re-run (uses ON CONFLICT for article, DELETE+INSERT for flashcards).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. INSERT THE ARTICLE INTO kb_articles
-- ============================================================================

INSERT INTO kb_articles (
  id,
  title,
  slug,
  category,
  tags,
  content,
  excerpt,
  status,
  module_id,
  lesson_id,
  author,
  subtitle,
  images,
  estimated_minutes
)
VALUES (
  'a1100001-0000-0000-0000-000000000001',
  'Development of the Survey Chain',
  'development-of-the-survey-chain',
  'History & Heritage',
  ARRAY['chain','gunter','survey history','lincoln','measurement','steel tape','frontier surveying','texas surveying'],
  -- ── content (rich HTML) ──────────────────────────────────────────────────
  '
<!-- ================================================================== -->
<!--  DEVELOPMENT OF THE SURVEY CHAIN                                    -->
<!--  by Milton Denny                                                    -->
<!-- ================================================================== -->

<p class="article-lead"><em>No instrument shaped the American landscape more profoundly than the surveyor''s chain. For over two centuries it was the primary tool by which wilderness was measured, property was defined, and a nation was divided into orderly sections. From Edmund Gunter''s ingenious 66-foot design in 1620 to the steel tapes that finally replaced it in the early twentieth century, the chain was the indispensable companion of every land surveyor — including a young Illinois rail-splitter named Abraham Lincoln.</em></p>

<hr />

<!-- ────────────────── Section 1: Introduction ────────────────── -->

<h2>The Chain: A Surveyor''s Most Essential Tool</h2>

<p>When we picture the tools of the surveying profession, modern total stations and GPS receivers come to mind. Yet for the vast majority of surveying history, the most critical instrument was far simpler: a chain made of metal links, stretched between two people across the raw earth. Everything else — the compass, the transit, the level — was secondary. Without an accurate means of measuring distance, none of the angular observations in the world could produce a usable map or a defensible property boundary.</p>

<p>The surveyor''s chain was not merely a tool; it was a <strong>unit of measure</strong>. Legal descriptions across the United States and the former British Empire still reference chains and links today. When a deed reads <em>"thence North 45 degrees East, 10 chains and 25 links,"</em> it is speaking the language of an instrument invented over four hundred years ago. Understanding the chain — its design, its mathematics, and its history — is essential for any modern surveyor who reads historical plats, retraces original surveys, or interprets the metes-and-bounds descriptions that underpin millions of land titles.</p>

<blockquote>
<p>"The chain is the surveyor''s most ancient and most important instrument. Without it he cannot measure the earth, and without measurement there can be no map, no deed, and no civilization built upon the certainty of boundaries."</p>
<footer>— <strong>A Treatise on Land Surveying</strong>, 1850</footer>
</blockquote>

<!-- ────────────────── Section 2: Edmund Gunter ────────────────── -->

<h2>Edmund Gunter and the Birth of the Chain (1620)</h2>

<p>The story of the survey chain begins with <strong>Edmund Gunter</strong> (1581–1626), an English clergyman and mathematician who held the chair of astronomy at Gresham College, London. In <strong>1620</strong>, Gunter published his landmark work describing a measuring chain specifically designed to bridge the gap between the traditional English system of land measurement and the emerging decimal arithmetic that was revolutionizing science.</p>

<p>Gunter''s stroke of genius was his choice of dimensions:</p>

<table>
<thead>
  <tr><th>Property</th><th>Value</th></tr>
</thead>
<tbody>
  <tr><td>Total length</td><td><strong>66 feet</strong> (4 rods / poles / perches)</td></tr>
  <tr><td>Number of links</td><td><strong>100 links</strong></td></tr>
  <tr><td>Length per link</td><td>7.92 inches</td></tr>
  <tr><td>10 square chains</td><td>= <strong>1 acre</strong> (43,560 sq ft)</td></tr>
  <tr><td>80 chains</td><td>= <strong>1 mile</strong> (5,280 feet)</td></tr>
</tbody>
</table>

<p>The elegance of this system cannot be overstated. By making the chain exactly 66 feet long and dividing it into 100 links, Gunter created a <strong>decimal system for land measurement</strong> that was fully compatible with the existing English units of acres and miles. A rectangle measuring 1 chain by 10 chains equals exactly 1 acre. A distance of 80 chains equals exactly 1 mile. These relationships made field calculations vastly simpler in an era before electronic calculators — a chainman could convert his measurements to acreage with basic multiplication rather than laborious long division.</p>

<p>This was no accident. Gunter understood that surveyors needed to work in two worlds simultaneously: the <strong>traditional world</strong> of rods, furlongs, and acres used in English common law and land grants, and the <strong>mathematical world</strong> of decimal computation. His 66-foot chain was the perfect bridge between the two.</p>

<figure data-article-image="gunter-chain-diagram">
  <img src="/articles/survey-chain/gunter-chain-diagram.jpg" alt="Diagram of Gunter''s chain showing 100 links spanning 66 feet, with tally markers at every 10 links" />
  <figcaption><strong>Gunter''s Chain (1620).</strong> The chain consisted of 100 links, each 7.92 inches long, for a total length of 66 feet. Brass tally markers at every 10th link helped chainmen keep count in the field. The relationship 80 chains = 1 mile and 10 square chains = 1 acre made this design the standard for land measurement across the English-speaking world.</figcaption>
</figure>

<h3>How the Mathematics Work</h3>

<p>Consider the arithmetic that made Gunter''s design so practical:</p>

<ul>
<li><strong>Area in acres</strong> = (length in chains x width in chains) / 10</li>
<li>A parcel 20 chains long and 5 chains wide = 100 square chains / 10 = <strong>10 acres</strong></li>
<li>1 link = 0.01 chain, so distances could be recorded as decimals of a chain (e.g., 15.47 chains)</li>
<li>80 chains = 5,280 feet = 1 mile, creating a clean conversion to the statute mile</li>
</ul>

<p>This decimal convenience ensured that Gunter''s chain — not some other length — became the <strong>universal standard</strong> for land surveying throughout the British Empire and, later, the United States. The 1785 Land Ordinance that created the U.S. Public Land Survey System (PLSS) explicitly mandated the use of the Gunter''s chain, cementing its place in American law and practice for the next century and a half.</p>

<!-- ────────────────── Section 3: The American Frontier ────────────────── -->

<h2>The Chain in the American Frontier</h2>

<p>When the newly independent United States faced the monumental task of surveying and distributing the vast public domain west of the Appalachian Mountains, the Gunter''s chain became the instrument of empire. The <strong>Land Ordinance of 1785</strong>, drafted largely by Thomas Jefferson, established the rectangular survey system that would impose a grid of townships, sections, and quarter-sections across nearly three-quarters of the nation''s land area.</p>

<p>Under this system, a <strong>township</strong> measured 6 miles on a side (480 chains), containing 36 <strong>sections</strong> of 1 square mile each (80 chains per side). Each section contained <strong>640 acres</strong>. The smallest common subdivision, the quarter-quarter section, was 40 acres — the origin of the phrase <em>"the back forty."</em></p>

<blockquote>
<p>"In the great national surveys, the chain was more than an instrument — it was an agent of democracy. Each link pulled westward was another step toward turning wilderness into property, and property into citizenship."</p>
</blockquote>

<p>Deputy surveyors working under contract to the General Land Office (GLO) carried their chains across prairies, through forests, over rivers, and up mountainsides. The work was physically grueling and often dangerous. A survey crew typically consisted of:</p>

<ul>
<li><strong>Two chainmen</strong> — one at each end of the chain, responsible for measuring distance</li>
<li><strong>An axeman</strong> — to clear brush and blaze witness trees</li>
<li><strong>A flagman</strong> — to mark the line of sight</li>
<li><strong>The surveyor</strong> — who directed operations, read the compass, and recorded notes</li>
</ul>

<h3>The Chain in Texas</h3>

<p>Texas presents a unique chapter in the story of the survey chain. As an independent republic (1836–1845) with roots in Spanish and Mexican land-grant traditions, Texas used a dual system of measurement. The <strong>Spanish vara</strong> — approximately <strong>33.333 inches</strong> (or 2.778 feet) — remained the primary unit for older grants, while the Gunter''s chain was used for newer surveys under the Republic and later under state law.</p>

<p>Texas land grants frequently mixed these units. A surveyor might measure a tract with a chain but record the dimensions in varas, or vice versa. This dual heritage means that modern Texas surveyors must be comfortable converting between both systems:</p>

<table>
<thead>
  <tr><th>Unit</th><th>Equivalent</th></tr>
</thead>
<tbody>
  <tr><td>1 vara</td><td>33.333 inches (approx.)</td></tr>
  <tr><td>1 vara</td><td>2.778 feet (approx.)</td></tr>
  <tr><td>1 Gunter''s chain</td><td>23.76 varas (approx.)</td></tr>
  <tr><td>1 league (Texas)</td><td>5,000 varas = approximately 2.63 miles</td></tr>
  <tr><td>1 labor</td><td>1,000,000 square varas = approximately 177 acres</td></tr>
</tbody>
</table>

<p>Because Texas was never part of the federal public domain, it was not surveyed under the PLSS. Instead, Texas surveys follow the <strong>metes-and-bounds</strong> system inherited from Spanish colonial practice, supplemented by its own land-office grid. This makes old Texas surveys some of the most challenging to retrace — and a thorough understanding of the chain and the vara is indispensable for the work.</p>

<!-- ────────────────── Section 4: Chain Construction ────────────────── -->

<h2>Chain Construction: Evolution of Design</h2>

<p>The physical construction of the surveyor''s chain evolved significantly over its centuries of use. Understanding these changes is not merely academic — it matters when retracing old surveys, because the <strong>type of chain used</strong> can affect the actual distance measured.</p>

<h3>Early Chains: Open Wire Links (Pre-1855)</h3>

<figure data-article-image="chain-link-early">
  <img src="/articles/survey-chain/chain-link-early.jpg" alt="Close-up photograph of an early open wire chain link, showing the simple bent wire construction with looped ends" />
  <figcaption><strong>Early open wire chain link.</strong> Before approximately 1855, chain links were made from heavy iron or steel wire bent into elongated loops and connected by circular rings. The open construction made them susceptible to catching on brush and bending in use, but they were inexpensive and easy to repair in the field.</figcaption>
</figure>

<p>The earliest Gunter''s chains were made from <strong>heavy iron wire</strong>. Each link was a piece of wire bent into an elongated oval loop, with the ends twisted or bent together. These links were connected by small <strong>circular rings</strong> at each junction. The entire assembly was remarkably simple in construction:</p>

<ul>
<li>Links were made from wire approximately 1/8 to 3/16 inch in diameter</li>
<li>Each link, including its connecting rings, measured 7.92 inches (the standard Gunter link)</li>
<li>The wire ends were <strong>not soldered or brazed</strong> — they were simply bent closed</li>
<li>Total chain weight ranged from 3 to 5 pounds depending on wire gauge</li>
</ul>

<p>These <em>open wire</em> links had significant disadvantages. The unbrazed ends could open up, allowing the link to stretch or even separate. Brush, weeds, and thorns caught in the open loops, slowing the work and potentially distorting the measurement. On the American frontier, where surveys often passed through dense undergrowth, these were serious practical problems.</p>

<h3>The Brazed Revolution (Post-1855)</h3>

<figure data-article-image="chain-link-brazed">
  <img src="/articles/survey-chain/chain-link-brazed.jpg" alt="Close-up photograph of a brazed chain link showing the sealed joint where the wire ends are fused together" />
  <figcaption><strong>Brazed chain link (post-1855).</strong> After approximately 1855, manufacturers began brazing (soldering with brass) the joints where wire ends met, creating a sealed, stronger link that resisted stretching and did not snag on vegetation as readily. Brazed chains became the professional standard for the remainder of the chain era.</figcaption>
</figure>

<p>After approximately <strong>1855</strong>, chain manufacturers began <strong>brazing</strong> the wire joints — that is, fusing the overlapping wire ends together using a brass alloy solder applied with heat. This seemingly small improvement had major practical consequences:</p>

<ul>
<li>Links could no longer open up, eliminating a major source of cumulative error</li>
<li>The smooth, sealed joints <strong>slid through vegetation</strong> much more easily</li>
<li>Overall chain durability increased substantially</li>
<li>Chains maintained their calibrated length far longer in service</li>
</ul>

<p>The transition was not instantaneous. Many surveyors in remote areas continued using open-link chains well into the 1870s and 1880s, particularly on the western frontier where replacement equipment was hard to obtain. When retracing an old survey, a careful researcher notes the approximate date and considers whether the original surveyor likely used an open or brazed chain — a difference that could affect the actual distance measured by several links over a mile.</p>

<h3>Swivels, Handles, and Tally Markers</h3>

<figure data-article-image="chain-swivel">
  <img src="/articles/survey-chain/chain-swivel.jpg" alt="Detailed photograph of a brass chain swivel mechanism showing how it allows the chain to rotate without twisting" />
  <figcaption><strong>Chain swivel detail.</strong> Brass swivels placed at intervals along the chain allowed it to untwist during use. Without swivels, the chain would develop kinks that shortened its effective length and made it difficult to lay flat on the ground. Quality chains typically had swivels at both handles and at the midpoint.</figcaption>
</figure>

<p>A well-made surveyor''s chain was more than just a series of links. Several additional components were essential:</p>

<p><strong>Handles:</strong> Heavy brass or iron handles at each end, usually with a swivel attachment. The handles allowed the chainmen to grip the chain securely and apply the proper tension. The overall chain measurement of 66 feet (or 100 feet for an engineer''s chain) was measured <strong>from the outside of one handle to the outside of the other</strong>.</p>

<p><strong>Swivels:</strong> Brass swivel joints placed at both ends and sometimes at the midpoint. These prevented the chain from developing kinks by allowing it to rotate freely. A kinked chain was shorter than its true length, introducing systematic error.</p>

<p><strong>Tally markers:</strong> Small brass tags attached at every 10th link, shaped or numbered to indicate position. A common system used markers shaped with 1, 2, 3, and 4 points, with the 50-link (midpoint) marker being round or distinctively shaped. Tallies allowed a chainman to identify any link''s position quickly without counting from the end — critical when recording partial chain lengths.</p>

<!-- ────────────────── Section 5: The Engineer''s Chain ────────────────── -->

<h2>The Engineer''s Chain</h2>

<p>While Gunter''s chain dominated <em>land</em> surveying, a different chain was preferred for <em>engineering</em> and construction work. The <strong>engineer''s chain</strong> (also called the <em>hundred-foot chain</em>) differed from Gunter''s in several key respects:</p>

<table>
<thead>
  <tr><th>Property</th><th>Gunter''s Chain</th><th>Engineer''s Chain</th></tr>
</thead>
<tbody>
  <tr><td>Total length</td><td>66 feet</td><td><strong>100 feet</strong></td></tr>
  <tr><td>Number of links</td><td>100</td><td><strong>100</strong></td></tr>
  <tr><td>Length per link</td><td>7.92 inches</td><td><strong>1 foot (12 inches)</strong></td></tr>
  <tr><td>Primary use</td><td>Land surveys, legal descriptions</td><td>Engineering, construction, route surveys</td></tr>
  <tr><td>Relationship to mile</td><td>80 chains = 1 mile</td><td>52.8 chains = 1 mile</td></tr>
  <tr><td>Relationship to acre</td><td>10 sq. chains = 1 acre</td><td>No clean relationship</td></tr>
</tbody>
</table>

<p>The engineer''s chain was designed for situations where <strong>feet and decimals of a foot</strong> were more convenient than chains and links. Railroad surveys, canal construction, road building, and municipal engineering all worked in feet, and the engineer''s chain — with its 1-foot links — was a natural fit. Distances recorded with an engineer''s chain could be used directly in engineering calculations without conversion.</p>

<p>However, the engineer''s chain had <strong>no convenient relationship to the acre</strong>, which made it unsuitable for land surveying where area calculations were essential. This is why the two chain types coexisted: Gunter''s for land work and the engineer''s chain for construction and route surveys.</p>

<!-- ────────────────── Section 6: Abraham Lincoln''s Chain ────────────────── -->

<h2>Abraham Lincoln''s Chain</h2>

<p>One of the most remarkable chapters in the history of the survey chain involves a young man who would become the sixteenth President of the United States. In <strong>1833</strong>, at the age of twenty-four, <strong>Abraham Lincoln</strong> was appointed <strong>deputy surveyor of Sangamon County, Illinois</strong> by <strong>John Calhoun</strong>, the county surveyor. Lincoln had no formal training in surveying, but he was determined to learn.</p>

<blockquote>
<p>"Lincoln procured a compass and chain, studied Flint and Gibson, and put himself to work. In six weeks he was surveying, and soon had all the work he could do."</p>
<footer>— <strong>William H. Herndon</strong>, Lincoln''s law partner and biographer</footer>
</blockquote>

<p>Lincoln borrowed books on surveying — primarily Robert Gibson''s <em>A Treatise on Practical Surveying</em> and Abel Flint''s <em>A System of Geometry and Trigonometry with a Treatise on Surveying</em> — and taught himself the mathematics of the profession. He purchased a compass and chain on credit (he was perpetually short of money in those years) and quickly became proficient enough to begin accepting survey commissions.</p>

<figure data-article-image="lincoln-survey">
  <img src="/articles/survey-chain/lincoln-survey.jpg" alt="Illustration depicting a young Abraham Lincoln surveying on the Illinois prairie with a compass and chain, accompanied by chainmen" />
  <figcaption><strong>Lincoln the surveyor.</strong> Between 1833 and 1836, Abraham Lincoln worked as a deputy surveyor in Sangamon County, Illinois. He surveyed roads, town lots, and farm boundaries across the Illinois prairie, earning a reputation for fairness and accuracy that launched his public career.</figcaption>
</figure>

<h3>Surveying on the Illinois Prairie</h3>

<p>For approximately three years (1833–1836), Lincoln surveyed extensively across the Sangamon County region. His work included:</p>

<ul>
<li><strong>Road surveys</strong> — laying out new roads and relocating existing ones for the county</li>
<li><strong>Town plats</strong> — surveying and platting new towns, including the town of New Salem and portions of what became the city of Petersburg</li>
<li><strong>Farm boundaries</strong> — subdividing sections and establishing property lines for settlers</li>
<li><strong>Individual lot surveys</strong> — marking boundaries for land sales and disputes</li>
</ul>

<p>Lincoln''s surveying work was conducted with a Gunter''s chain — the standard instrument specified by Illinois law for all official surveys. He and his chainmen would have dragged that 66-foot chain across miles of open prairie, through timber, and across creeks. Every section line, every lot corner, and every road alignment depended on the accuracy of their chaining.</p>

<h3>How Surveying Shaped Lincoln</h3>

<p>The experience of surveying had a profound influence on Lincoln''s later career. Surveying taught him <strong>precision</strong> — a quality that would characterize his legal arguments and his writing. It taught him <strong>mathematics</strong> — Lincoln continued to study Euclid''s <em>Elements</em> throughout his life and was known for his ability to construct logical proofs. And it gave him something invaluable for a future politician: <strong>intimate knowledge of the land and its people</strong>.</p>

<p>As a surveyor, Lincoln walked every corner of his county. He met farmers, merchants, and settlers of every background. He learned their disputes, their ambitions, and their concerns. His reputation for honesty and fairness in surveying — he was known never to favor one neighbor over another when setting a line — earned him the trust that would launch his political career.</p>

<p>Lincoln''s surveying also led directly to his study of law. Many of the disputes he encountered in the field were legal in nature — conflicting claims, overlapping boundaries, ambiguous descriptions. The transition from surveyor to lawyer was a natural one, and Lincoln was admitted to the bar in 1836, the same year he stopped surveying regularly.</p>

<blockquote>
<p>"It is not too much to say that the chain and compass were Lincoln''s first teachers in the school of practical affairs. They taught him to measure not only land, but men."</p>
</blockquote>

<!-- ────────────────── Section 7: The Steel Tape Revolution ────────────────── -->

<h2>The Steel Tape Revolution</h2>

<p>By the mid-nineteenth century, the limitations of the chain were becoming increasingly apparent. Even the best brazed chains stretched with use, wore at the joints, and lost calibration. The metallic joints accumulated small errors — each one tiny, but over the length of a survey, potentially significant. Engineers and surveyors began seeking a more precise alternative.</p>

<figure data-article-image="steel-tape">
  <img src="/articles/survey-chain/steel-tape.jpg" alt="Photograph of an early steel measuring tape on a reel, showing the graduated markings and the leather case" />
  <figcaption><strong>Early steel tape.</strong> The steel band tape, first developed by James Chesterman of Sheffield, England, offered greater precision and consistency than the chain. American manufacturers like Gurley and Keuffel &amp; Esser refined the design and made steel tapes widely available by the late nineteenth century, eventually supplanting the chain for precision work.</figcaption>
</figure>

<p>The answer came from <strong>James Chesterman of Sheffield, England</strong>, who developed the first practical <strong>steel band tape</strong>. Chesterman''s innovation was to roll steel into a thin, flat ribbon that could be graduated with precise markings, wound on a reel for portability, and stretched for measurement. The steel tape offered several critical advantages over the chain:</p>

<ul>
<li><strong>Greater precision:</strong> A continuous ribbon has no joints to accumulate error</li>
<li><strong>Lighter weight:</strong> A 100-foot steel tape weighed far less than a 100-foot chain</li>
<li><strong>Consistent length:</strong> Steel tapes maintained their calibration far better than chains</li>
<li><strong>Easier reading:</strong> Graduated markings allowed direct reading of feet, tenths, and hundredths</li>
</ul>

<p>In the United States, two companies became the principal manufacturers and distributors of precision surveying tapes: <strong>W. &amp; L.E. Gurley</strong> of Troy, New York, and <strong>Keuffel &amp; Esser (K&amp;E)</strong> of New York City. Both firms produced steel tapes graduated to hundredths of a foot, housed in leather or metal cases, and built to the exacting tolerances that precision surveying demanded.</p>

<h3>The Transition Period</h3>

<p>The transition from chain to steel tape was gradual, spanning roughly from the 1870s to the 1920s. Several factors slowed adoption:</p>

<ul>
<li><strong>Cost:</strong> Steel tapes were significantly more expensive than chains</li>
<li><strong>Fragility:</strong> A steel tape could kink or break if stepped on or run over, while a chain was nearly indestructible</li>
<li><strong>Legal requirements:</strong> Many states continued to require the Gunter''s chain for official land surveys well into the twentieth century</li>
<li><strong>Habit:</strong> Experienced surveyors were comfortable with chains and resistant to change</li>
</ul>

<p>Eventually, however, the superior accuracy of the steel tape won out. By the 1920s, the chain had been relegated to historical curiosity for most practical purposes, replaced by steel and later <strong>Invar</strong> (a nickel-steel alloy with extremely low thermal expansion) tapes for the highest-precision work.</p>

<!-- ────────────────── Section 8: Legacy ────────────────── -->

<h2>Legacy: The Chain Lives On</h2>

<p>Although no surveyor today drags a chain through the brush, the chain''s influence on the American landscape is permanent and pervasive. Its legacy persists in several important ways:</p>

<p><strong>Legal descriptions:</strong> Millions of property deeds, recorded plats, and court records across the United States describe distances in chains and links. A surveyor retracing an 1850 boundary must understand not just what a chain is, but what <em>kind</em> of chain was likely used, how it was calibrated, and what systematic errors it may have introduced.</p>

<p><strong>The Public Land Survey System:</strong> The entire PLSS grid — covering 30 states — was laid out with Gunter''s chains. Section lines are 80 chains long. Quarter-section lines are 40 chains. These measurements are the legal framework for land ownership across the majority of the continental United States.</p>

<p><strong>The acre:</strong> The acre itself is a chain-derived unit. One acre equals 10 square chains, or a rectangle 1 chain (66 feet) wide and 1 furlong (660 feet, or 10 chains) long. Every time a real estate listing quotes acreage, it is unwittingly referencing Edmund Gunter''s 1620 invention.</p>

<p><strong>The mile:</strong> The statute mile of 5,280 feet was defined partly by its relationship to the chain: 80 chains = 1 mile. The seemingly odd number 5,280 makes perfect sense as 80 x 66.</p>

<table>
<thead>
  <tr><th>Modern Term</th><th>Chain Origin</th></tr>
</thead>
<tbody>
  <tr><td>1 acre</td><td>10 square Gunter''s chains (1 chain x 10 chains)</td></tr>
  <tr><td>1 mile (5,280 ft)</td><td>80 Gunter''s chains x 66 feet</td></tr>
  <tr><td>1 section (640 acres)</td><td>80 chains x 80 chains</td></tr>
  <tr><td>"the back forty"</td><td>A quarter-quarter section: 20 chains x 20 chains = 40 acres</td></tr>
  <tr><td>1 furlong (660 ft)</td><td>10 Gunter''s chains</td></tr>
</tbody>
</table>

<blockquote>
<p>"Long after the last surveyor''s chain was hung on a museum wall, its echoes continued to shape the land. Every deed, every plat, every section line in the public domain is a monument to the simple brilliance of Gunter''s 66 feet of iron links."</p>
</blockquote>

<p>For the student of surveying, the chain is more than a historical curiosity. It is the <strong>foundation upon which modern land measurement was built</strong>. Understanding the chain — its dimensions, its mathematics, its evolution, and its limitations — provides essential context for reading historical surveys, retracing old boundaries, and appreciating the remarkable accuracy that skilled chainmen achieved with nothing more than a string of metal links and the open sky above them.</p>

<hr />

<p class="article-footer"><em>Milton Denny is a licensed professional land surveyor and surveying historian. This article is adapted from his research on the tools and methods of early American land surveying, with particular attention to the instruments used in the Texas and Illinois frontiers.</em></p>
',
  -- ── excerpt ──────────────────────────────────────────────────────────────
  'A comprehensive history of the surveyor''s chain — from Edmund Gunter''s ingenious 66-foot design in 1620 through the open-wire and brazed-link eras, Abraham Lincoln''s years as a deputy surveyor in Illinois, and the eventual transition to steel tapes by Chesterman, Gurley, and K&E.',
  -- ── status ───────────────────────────────────────────────────────────────
  'published',
  -- ── module_id (SRVY 1341) ────────────────────────────────────────────────
  'acc00003-0000-0000-0000-000000000003',
  -- ── lesson_id (Lesson 2) ─────────────────────────────────────────────────
  'acc03b02-0000-0000-0000-000000000001',
  -- ── author ───────────────────────────────────────────────────────────────
  'Milton Denny',
  -- ── subtitle ─────────────────────────────────────────────────────────────
  'Abraham Lincoln''s Chain: From Gunter''s Links to the Steel Tape',
  -- ── images (JSONB array) ─────────────────────────────────────────────────
  '[
    {"src": "/articles/survey-chain/chain-link-early.jpg",    "alt": "Early open wire chain link",               "caption": "Before approximately 1855, chain links were made from heavy wire bent into loops with unbrazed ends, making them susceptible to stretching and snagging."},
    {"src": "/articles/survey-chain/chain-link-brazed.jpg",   "alt": "Brazed chain link (post-1855)",            "caption": "After approximately 1855, manufacturers brazed the wire joints with brass alloy, creating sealed links that resisted stretching and slid through vegetation more easily."},
    {"src": "/articles/survey-chain/chain-swivel.jpg",        "alt": "Chain swivel detail",                      "caption": "Brass swivels at the handles and midpoint prevented the chain from twisting and kinking during use, which would have shortened its effective length."},
    {"src": "/articles/survey-chain/gunter-chain-diagram.jpg","alt": "Gunter''s chain with measurements diagram", "caption": "Gunter''s chain: 100 links at 7.92 inches each, totaling 66 feet. Brass tally markers at every 10th link aided counting in the field."},
    {"src": "/articles/survey-chain/lincoln-survey.jpg",      "alt": "Lincoln surveying illustration",            "caption": "Abraham Lincoln served as deputy surveyor of Sangamon County, Illinois from 1833 to 1836, appointed by county surveyor John Calhoun."},
    {"src": "/articles/survey-chain/steel-tape.jpg",          "alt": "Early steel measuring tape",                "caption": "Steel band tapes developed by Chesterman of Sheffield and refined by American manufacturers Gurley and K&E gradually replaced the chain for precision surveying work."}
  ]'::jsonb,
  -- ── estimated_minutes ────────────────────────────────────────────────────
  15
)
ON CONFLICT (id) DO UPDATE SET
  title              = EXCLUDED.title,
  slug               = EXCLUDED.slug,
  category           = EXCLUDED.category,
  tags               = EXCLUDED.tags,
  content            = EXCLUDED.content,
  excerpt            = EXCLUDED.excerpt,
  status             = EXCLUDED.status,
  module_id          = EXCLUDED.module_id,
  lesson_id          = EXCLUDED.lesson_id,
  author             = EXCLUDED.author,
  subtitle           = EXCLUDED.subtitle,
  images             = EXCLUDED.images,
  estimated_minutes  = EXCLUDED.estimated_minutes,
  updated_at         = now();


-- ============================================================================
-- 2. LINK AS REQUIRED READING FOR LESSON 2 (lesson_required_articles)
-- ============================================================================

INSERT INTO lesson_required_articles (lesson_id, article_id, order_index)
VALUES (
  'acc03b02-0000-0000-0000-000000000001',   -- SRVY 1341 Lesson 2
  'a1100001-0000-0000-0000-000000000001',   -- this article
  0                                          -- first required article
)
ON CONFLICT (lesson_id, article_id) DO UPDATE SET
  order_index = EXCLUDED.order_index;


-- ============================================================================
-- 3. FLASHCARDS (10 cards covering article content)
-- ============================================================================
-- Uses DELETE + INSERT for safe re-run (flashcards table has no unique
-- constraint beyond the PK, so ON CONFLICT on id is used as fallback).

DELETE FROM flashcards WHERE id IN (
  'fc02-a001-0000-0000-000000000001',
  'fc02-a002-0000-0000-000000000001',
  'fc02-a003-0000-0000-000000000001',
  'fc02-a004-0000-0000-000000000001',
  'fc02-a005-0000-0000-000000000001',
  'fc02-a006-0000-0000-000000000001',
  'fc02-a007-0000-0000-000000000001',
  'fc02-a008-0000-0000-000000000001',
  'fc02-a009-0000-0000-000000000001',
  'fc02-a010-0000-0000-000000000001'
);

INSERT INTO flashcards (id, term, definition, hint_1, hint_2, hint_3, module_id, lesson_id, keywords, tags, category)
VALUES

-- Card 1: Gunter's Chain length
(
  'fc02-a001-0000-0000-000000000001',
  'Gunter''s Chain — Total Length and Links',
  'Gunter''s chain is 66 feet long and consists of 100 links, each 7.92 inches long. Designed by Edmund Gunter in 1620, its dimensions create clean conversions: 80 chains = 1 mile and 10 square chains = 1 acre.',
  'Think about what number of chains makes a mile — it''s a round number',
  'Each link is just under 8 inches',
  '_ _ feet total, _ _ _ links (hint: 66 and 100)',
  'acc00003-0000-0000-0000-000000000003',
  'acc03b02-0000-0000-0000-000000000001',
  ARRAY['gunter','chain','66 feet','100 links','7.92 inches','edmund gunter','1620'],
  ARRAY['survey history','measurement','chain'],
  'survey history'
),

-- Card 2: 80 chains = 1 mile
(
  'fc02-a002-0000-0000-000000000001',
  'How many Gunter''s chains equal one mile?',
  '80 Gunter''s chains = 1 mile (5,280 feet). This works because 80 x 66 feet = 5,280 feet. This relationship was central to the U.S. Public Land Survey System, where section lines were 80 chains long.',
  'It''s a round number — think multiples of 10',
  '66 x ??? = 5,280',
  '_ _ chains = 1 mile (a number between 70 and 90)',
  'acc00003-0000-0000-0000-000000000003',
  'acc03b02-0000-0000-0000-000000000001',
  ARRAY['chain','mile','80 chains','5280 feet','PLSS','section'],
  ARRAY['measurement','conversion','chain'],
  'survey history'
),

-- Card 3: 10 square chains = 1 acre
(
  'fc02-a003-0000-0000-000000000001',
  'How many square Gunter''s chains equal one acre?',
  '10 square Gunter''s chains = 1 acre (43,560 square feet). A rectangle 1 chain (66 ft) wide by 10 chains (660 ft) long equals exactly 1 acre. This elegant relationship made Gunter''s chain ideal for computing land area.',
  'A very small number of square chains — think single digits plus one',
  'A 1-chain x 10-chain rectangle equals this unit of area',
  '_ _ square chains = 1 acre',
  'acc00003-0000-0000-0000-000000000003',
  'acc03b02-0000-0000-0000-000000000001',
  ARRAY['chain','acre','10 square chains','43560','area','gunter'],
  ARRAY['measurement','conversion','area'],
  'survey history'
),

-- Card 4: Engineer's Chain
(
  'fc02-a004-0000-0000-000000000001',
  'Engineer''s Chain vs. Gunter''s Chain',
  'The engineer''s chain is 100 feet long with 100 links of 1 foot each, compared to Gunter''s 66-foot chain with 7.92-inch links. The engineer''s chain was used for construction and route surveys where feet and decimals were more practical, but it had no clean relationship to the acre.',
  'The engineer''s chain uses a rounder, more "engineering-friendly" length',
  'Each link equals exactly 1 foot',
  '_ _ _ feet total, _ _ _ links (hint: 100 and 100)',
  'acc00003-0000-0000-0000-000000000003',
  'acc03b02-0000-0000-0000-000000000001',
  ARRAY['engineer chain','100 feet','100 links','1 foot per link','construction','route survey'],
  ARRAY['measurement','chain','engineering'],
  'survey history'
),

-- Card 5: Brazed joints (post-1855)
(
  'fc02-a005-0000-0000-000000000001',
  'Brazed Chain Joints (Post-1855)',
  'After approximately 1855, chain manufacturers began brazing (fusing with brass alloy) the wire joints in chain links. Brazed joints replaced the earlier open wire links, creating sealed connections that resisted stretching, lasted longer, and slid through vegetation more easily.',
  'A soldering technique named after the metal alloy used',
  'This improvement happened around the middle of the 19th century',
  'B _ _ _ _ _ joints sealed the wire ends with brass (rhymes with "glazed")',
  'acc00003-0000-0000-0000-000000000003',
  'acc03b02-0000-0000-0000-000000000001',
  ARRAY['brazed','1855','chain construction','open wire','sealed joints','brass'],
  ARRAY['chain','construction','history'],
  'survey history'
),

-- Card 6: Abraham Lincoln as surveyor
(
  'fc02-a006-0000-0000-000000000001',
  'Abraham Lincoln — Deputy Surveyor',
  'In 1833, Abraham Lincoln was appointed deputy surveyor of Sangamon County, Illinois by county surveyor John Calhoun. Lincoln taught himself surveying from Gibson''s and Flint''s textbooks and worked as a surveyor for approximately three years, surveying roads, town plats, and farm boundaries.',
  'He was appointed in the 1830s — before he became a lawyer',
  'The county was in Illinois, and the county surveyor''s last name starts with C',
  'Year: 18_ _ (between 1830 and 1840). Appointed by John C _ _ _ _ _ _',
  'acc00003-0000-0000-0000-000000000003',
  'acc03b02-0000-0000-0000-000000000001',
  ARRAY['lincoln','1833','sangamon county','illinois','john calhoun','deputy surveyor'],
  ARRAY['survey history','lincoln','famous surveyors'],
  'survey history'
),

-- Card 7: Chesterman steel tape
(
  'fc02-a007-0000-0000-000000000001',
  'Who developed the first practical steel band tape?',
  'James Chesterman of Sheffield, England developed the first practical steel band tape. The steel tape offered greater precision, lighter weight, and more consistent calibration than the chain. It eventually replaced the chain for precision surveying work.',
  'He was from a famous steel-making city in England',
  'His last name sounds like a "chest" plus "man"',
  'C _ _ _ _ _ _ _ _ _ of Sheffield, England',
  'acc00003-0000-0000-0000-000000000003',
  'acc03b02-0000-0000-0000-000000000001',
  ARRAY['chesterman','sheffield','steel tape','england','band tape'],
  ARRAY['instruments','steel tape','history'],
  'survey history'
),

-- Card 8: Texas vara
(
  'fc02-a008-0000-0000-000000000001',
  'The Spanish Vara in Texas Surveying',
  'Texas used the Spanish vara alongside the Gunter''s chain due to its Spanish and Mexican land-grant heritage. One vara equals approximately 33.333 inches (about 2.778 feet). Texas surveyors must understand both systems when retracing historical surveys.',
  'It''s a Spanish unit of length — about 1/3 longer than a yardstick',
  'Approximately 33 and 1/3 inches',
  '1 vara = approximately _ _.333 inches',
  'acc00003-0000-0000-0000-000000000003',
  'acc03b02-0000-0000-0000-000000000001',
  ARRAY['vara','texas','spanish','33.333 inches','2.778 feet','land grant','metes and bounds'],
  ARRAY['texas surveying','measurement','history'],
  'survey history'
),

-- Card 9: Gurley and K&E
(
  'fc02-a009-0000-0000-000000000001',
  'Major US Surveying Instrument Manufacturers',
  'W. & L.E. Gurley of Troy, New York and Keuffel & Esser (K&E) of New York City were the two principal American manufacturers of precision surveying tapes and instruments. Both produced steel tapes graduated to hundredths of a foot for professional surveying use.',
  'One company was based in Troy, NY; the other in New York City',
  'K&E stands for two German surnames',
  'G _ _ _ _ _ (Troy, NY) and K _ _ _ _ _ _ & E _ _ _ _ (NYC)',
  'acc00003-0000-0000-0000-000000000003',
  'acc03b02-0000-0000-0000-000000000001',
  ARRAY['gurley','keuffel and esser','K&E','troy','new york','steel tape','instruments'],
  ARRAY['instruments','manufacturers','history'],
  'survey history'
),

-- Card 10: Edmund Gunter
(
  'fc02-a010-0000-0000-000000000001',
  'Who was Edmund Gunter?',
  'Edmund Gunter (1581–1626) was an English clergyman and mathematician who held the chair of astronomy at Gresham College, London. In 1620, he designed the 66-foot, 100-link chain that became the universal standard for land surveying, brilliantly bridging traditional English land units with decimal arithmetic.',
  'He was both a clergyman and a mathematician in early 17th-century England',
  'He designed his famous chain in the year 1620',
  'Edmund G _ _ _ _ _ — professor at Gresham College, London',
  'acc00003-0000-0000-0000-000000000003',
  'acc03b02-0000-0000-0000-000000000001',
  ARRAY['edmund gunter','1620','gresham college','66 feet','100 links','mathematician','clergyman'],
  ARRAY['survey history','famous people','chain'],
  'survey history'
);


COMMIT;
