// app/api/admin/learn/seed/route.ts — Seed introductory educational content
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

const INTRO_MODULE_ID = '11111111-1111-1111-1111-111111111111';

const LESSONS = [
  {
    id: '22222222-2222-2222-2222-222222222221',
    module_id: INTRO_MODULE_ID,
    title: 'What is Land Surveying?',
    content: `<h2>What is Land Surveying?</h2>
<p>Land surveying is the science, art, and profession of determining the terrestrial or three-dimensional positions of points and the distances and angles between them. Surveyors use mathematics, specialized technology, and legal knowledge to establish official land boundaries, create maps, and provide data for engineering projects.</p>

<h3>A Brief History</h3>
<p>Surveying has been practiced since humans first began building permanent structures. The ancient Egyptians used surveying to re-establish farm boundaries after the annual Nile floods. In Texas, land surveying dates back to Spanish and Mexican land grants. The <strong>Texas General Land Office</strong>, established in 1836, is the oldest state agency in the state and still manages millions of acres of public land today.</p>

<h3>Why Surveying Matters</h3>
<p>Every piece of land you see has been surveyed at some point. Without surveyors:</p>
<ul>
<li>Property boundaries would be uncertain, leading to disputes</li>
<li>Buildings, roads, and bridges could not be safely constructed</li>
<li>Flood zones could not be accurately mapped for insurance</li>
<li>Legal descriptions in deeds would be meaningless</li>
</ul>

<h3>Types of Surveys</h3>
<ul>
<li><strong>Boundary Surveys</strong> — Determine property lines and corners. This is the most common type of survey at Starr Surveying.</li>
<li><strong>Topographic Surveys</strong> — Map the shape and features of the land including elevations, trees, buildings, and utilities.</li>
<li><strong>ALTA/NSPS Surveys</strong> — Comprehensive surveys for commercial real estate transactions, following national standards.</li>
<li><strong>Construction Surveys</strong> — Guide building projects with precise measurements for foundations, roads, and utilities.</li>
<li><strong>Subdivision Surveys</strong> — Divide larger parcels into smaller lots with new legal descriptions.</li>
<li><strong>Elevation Certificates</strong> — Determine flood risk for insurance by establishing the elevation of a structure.</li>
</ul>

<h3>The Surveying Process at Starr</h3>
<p>At Starr Surveying, a typical boundary survey follows this workflow:</p>
<ol>
<li><strong>Research</strong> — Pull deeds, plats, and prior surveys from county records</li>
<li><strong>Field Work</strong> — Go on-site with GPS and total station equipment to locate existing monuments and measure the property</li>
<li><strong>Calculation</strong> — Process field data and compare to legal descriptions</li>
<li><strong>Drawing</strong> — Create the final survey plat or map</li>
<li><strong>Delivery</strong> — Provide signed and sealed documents to the client</li>
</ol>`,
    key_takeaways: [
      'Land surveying determines positions, distances, and angles between points',
      'Texas surveying dates back to Spanish land grants; the GLO was established in 1836',
      'Multiple survey types serve different purposes: boundary, topographic, ALTA, construction',
      'At Starr Surveying, boundary surveys follow a 5-step process: research, field work, calculation, drawing, delivery',
    ],
    order_index: 1,
    estimated_minutes: 20,
    status: 'published',
    tags: ['fundamentals', 'history', 'types'],
    resources: JSON.stringify([
      { title: 'Texas General Land Office', url: 'https://www.glo.texas.gov/', type: 'website' },
      { title: 'NSPS - What is Surveying?', url: 'https://www.nsps.us.com/page/AboutSurveying', type: 'website' },
    ]),
    videos: '[]',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    module_id: INTRO_MODULE_ID,
    title: 'Surveying Equipment & Tools',
    content: `<h2>Surveying Equipment & Tools</h2>
<p>Modern surveyors use a combination of traditional and high-tech equipment. Understanding these tools is essential for every member of the crew.</p>

<h3>Traditional Tools</h3>
<p>These tools have been used for centuries and are still relevant today:</p>
<ul>
<li><strong>Transit/Theodolite:</strong> Measures horizontal and vertical angles with high precision. The operator sights a target through the telescope and reads the angle from graduated circles.</li>
<li><strong>Level:</strong> Establishes a perfectly horizontal line of sight, used for determining elevation differences between points.</li>
<li><strong>Steel Tape:</strong> A calibrated metal tape for precise distance measurements, typically 100 or 200 feet long.</li>
<li><strong>Plumb Bob:</strong> A weighted point suspended from a string to establish a perfectly vertical line over a survey point.</li>
<li><strong>Range Pole:</strong> A tall pole with alternating red and white bands, used as a sighting target in the field.</li>
</ul>

<h3>Modern Electronic Tools</h3>
<p>These are the tools you will use most often at Starr Surveying:</p>
<ul>
<li><strong>Total Station:</strong> Combines an electronic theodolite with an Electronic Distance Measurement (EDM) device. It measures both angles and distances in a single instrument. Robotic total stations can track a prism automatically, allowing one-person operation.</li>
<li><strong>GPS/GNSS Receiver:</strong> Receives signals from multiple satellite constellations (GPS, GLONASS, Galileo, BeiDou). With Real-Time Kinematic (RTK) correction, provides centimeter-level accuracy.</li>
<li><strong>Data Collector:</strong> A ruggedized handheld computer that connects to the total station or GPS receiver. Runs survey software (like Trimble Access) to record measurements and guide field work.</li>
<li><strong>3D Laser Scanner:</strong> Creates detailed 3D point clouds of existing structures and terrain.</li>
<li><strong>Drone/UAV:</strong> Used for aerial photogrammetry on large sites, creating orthophotos and 3D surface models.</li>
</ul>

<h3>Equipment at Starr Surveying</h3>
<p>Our primary field equipment includes:</p>
<ul>
<li><strong>Trimble R12i</strong> — GNSS receiver for RTK positioning</li>
<li><strong>Trimble S7</strong> — Robotic total station for precise measurements</li>
<li><strong>Trimble TSC5</strong> — Data collector running Trimble Access</li>
<li><strong>Standard field kit</strong> — Machete, hammer, rebar caps, flagging tape, wooden stakes, PK nails, iron rods</li>
</ul>

<h3>Taking Care of Equipment</h3>
<p>Survey equipment is expensive and precise. Always:</p>
<ol>
<li>Store instruments in their cases when not in use</li>
<li>Never leave equipment unattended in a vehicle overnight</li>
<li>Clean lenses with proper lens cloth only</li>
<li>Check calibration regularly</li>
<li>Report any drops, impacts, or suspected damage immediately</li>
</ol>`,
    key_takeaways: [
      'Theodolites measure angles; levels establish horizontal planes',
      'Total stations combine electronic theodolite with EDM for angle and distance measurement',
      'GPS/GNSS with RTK provides centimeter-level positioning using satellite signals',
      'Starr Surveying primarily uses Trimble R12i (GNSS), S7 (robotic total station), and TSC5 (data collector)',
      'Always handle survey equipment with care — report any damage immediately',
    ],
    order_index: 2,
    estimated_minutes: 25,
    status: 'published',
    tags: ['equipment', 'tools', 'total station', 'GPS', 'GNSS'],
    resources: JSON.stringify([
      { title: 'Trimble Surveying Solutions', url: 'https://www.trimble.com/en/solutions/surveying', type: 'website' },
    ]),
    videos: '[]',
  },
];

const TOPICS = [
  // Lesson 1 topics
  { lesson_id: '22222222-2222-2222-2222-222222222221', title: 'Definition of Land Surveying', content: 'Land surveying is the science, art, and profession of determining the terrestrial or three-dimensional positions of points and the distances and angles between them. Surveyors use mathematics, technology, and legal knowledge to establish land boundaries and create maps.', order_index: 1, keywords: ['definition', 'surveying', 'measurement', 'positions'] },
  { lesson_id: '22222222-2222-2222-2222-222222222221', title: 'History of Surveying in Texas', content: 'Texas surveying history dates to Spanish and Mexican land grants. The Texas General Land Office, established in 1836, manages public lands. The vara (approximately 33.33 inches) was the standard measurement unit during the Republic of Texas era. Many original land grants are still referenced in modern surveys.', order_index: 2, keywords: ['history', 'texas', 'vara', 'land grants', 'GLO'] },
  { lesson_id: '22222222-2222-2222-2222-222222222221', title: 'Types of Land Surveys', content: 'Key types include: boundary surveys (property lines), topographic surveys (terrain mapping), ALTA/NSPS surveys (commercial real estate), construction surveys (building guidance), subdivision surveys (dividing parcels), and elevation certificates (flood risk). At Starr Surveying, boundary surveys are the most common.', order_index: 3, keywords: ['boundary', 'topographic', 'ALTA', 'NSPS', 'construction', 'subdivision', 'elevation'] },
  { lesson_id: '22222222-2222-2222-2222-222222222221', title: 'The Surveying Process', content: 'A typical boundary survey follows five steps: (1) Research — pull deeds, plats, and prior surveys, (2) Field Work — go on-site to locate monuments and measure, (3) Calculation — process data and compare to legal descriptions, (4) Drawing — create the final plat, (5) Delivery — provide signed documents to the client.', order_index: 4, keywords: ['process', 'workflow', 'research', 'fieldwork', 'drawing', 'delivery'] },
  // Lesson 2 topics
  { lesson_id: '22222222-2222-2222-2222-222222222222', title: 'Traditional Surveying Tools', content: 'Traditional tools include the transit/theodolite (measures angles), level (establishes horizontal planes), steel tape (precise distances), plumb bob (vertical reference), and range pole (sighting target). These fundamental tools are still used alongside modern equipment.', order_index: 1, keywords: ['transit', 'theodolite', 'level', 'steel tape', 'plumb bob'] },
  { lesson_id: '22222222-2222-2222-2222-222222222222', title: 'Total Stations & EDM', content: 'A total station combines an electronic theodolite with an Electronic Distance Measurement (EDM) device. It measures both angles and distances in one instrument. Robotic total stations track a prism automatically, allowing one-person operation. Starr Surveying uses the Trimble S7 robotic total station.', order_index: 2, keywords: ['total station', 'EDM', 'electronic', 'robotic', 'Trimble S7'] },
  { lesson_id: '22222222-2222-2222-2222-222222222222', title: 'GPS/GNSS Technology', content: 'GNSS encompasses GPS (US), GLONASS (Russia), Galileo (EU), and BeiDou (China). Real-Time Kinematic (RTK) correction uses a base station and rover to achieve centimeter-level accuracy. Starr Surveying uses the Trimble R12i GNSS receiver with RTK for most positioning tasks.', order_index: 3, keywords: ['GPS', 'GNSS', 'RTK', 'satellite', 'GLONASS', 'Galileo', 'Trimble R12i'] },
  { lesson_id: '22222222-2222-2222-2222-222222222222', title: 'Equipment Care & Safety', content: 'Survey equipment is expensive and precision-calibrated. Always store instruments in their cases, never leave them in vehicles overnight, clean lenses with proper cloth only, check calibration regularly, and report any drops or damage immediately. Proper equipment care ensures accurate measurements.', order_index: 4, keywords: ['care', 'safety', 'calibration', 'maintenance', 'storage'] },
];

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const results: string[] = [];

  try {
    // 1. Ensure the intro module exists
    const { data: existingModule } = await supabaseAdmin
      .from('learning_modules')
      .select('id')
      .eq('id', INTRO_MODULE_ID)
      .maybeSingle();

    if (!existingModule) {
      const { error: modErr } = await supabaseAdmin.from('learning_modules').insert({
        id: INTRO_MODULE_ID,
        title: 'Introduction to Land Surveying',
        description: 'Learn the fundamentals of land surveying, including history, types of surveys, equipment, and basic terminology used at Starr Surveying.',
        difficulty: 'beginner',
        estimated_hours: 2,
        order_index: 1,
        status: 'published',
        tags: ['fundamentals', 'introduction', 'beginner'],
      });
      if (modErr) results.push(`Module insert error: ${modErr.message}`);
      else results.push('Created intro module');
    } else {
      results.push('Intro module already exists');
    }

    // 2. Upsert lessons
    for (const lesson of LESSONS) {
      const { data: existingLesson } = await supabaseAdmin
        .from('learning_lessons')
        .select('id')
        .eq('id', lesson.id)
        .maybeSingle();

      if (existingLesson) {
        // Update existing lesson with richer content
        const { error: updErr } = await supabaseAdmin
          .from('learning_lessons')
          .update({
            title: lesson.title,
            content: lesson.content,
            key_takeaways: lesson.key_takeaways,
            estimated_minutes: lesson.estimated_minutes,
            status: lesson.status,
            tags: lesson.tags,
            resources: lesson.resources,
            videos: lesson.videos,
          })
          .eq('id', lesson.id);
        if (updErr) results.push(`Lesson update error (${lesson.title}): ${updErr.message}`);
        else results.push(`Updated lesson: ${lesson.title}`);
      } else {
        const { error: insErr } = await supabaseAdmin
          .from('learning_lessons')
          .insert(lesson);
        if (insErr) results.push(`Lesson insert error (${lesson.title}): ${insErr.message}`);
        else results.push(`Created lesson: ${lesson.title}`);
      }
    }

    // 3. Upsert topics (delete old ones for these lessons, then re-insert)
    const lessonIds = LESSONS.map(l => l.id);
    await supabaseAdmin.from('learning_topics').delete().in('lesson_id', lessonIds);

    const { error: topicErr } = await supabaseAdmin
      .from('learning_topics')
      .insert(TOPICS);
    if (topicErr) results.push(`Topics insert error: ${topicErr.message}`);
    else results.push(`Created ${TOPICS.length} topics`);

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, results }, { status: 500 });
  }
}
