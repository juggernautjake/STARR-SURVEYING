// lib/branding/logos.ts
//
// ── EVERY MARK, WITH ITS PROFILE ────────────────────────────────────────────────────────────────
//
// Owner: *"each image/logo has its own little profile where it shows the use cases for the
// image/logo, the fonts used in it, the colors used in it, and a description of the image/logo
// itself."*
//
// So a logo entry is not a filename and a caption any more. `colours` and `fonts` name entries in
// `palette.ts` rather than repeating values, which is what lets the portal render a swatch beside
// each mark and lets `brand-system.test.ts` fail if a mark claims a colour the palette does not
// have. A profile that drifts from the palette would be worse than no profile — it would be a
// confident wrong answer to "what red is in this logo?".
//
// `fonts` is honest about the common case: most of these marks are **custom lettering**, not type
// set in a font, and saying "Oswald" about a hand-drawn curve would send a designer looking for a
// match that does not exist. Where a face genuinely is the closest available match for rebuilding
// the mark, it is named as such.

import type { ColourName } from './palette';

export type LogoKind = 'badge' | 'lockup' | 'mark' | 'heritage' | 'apparel';

export type Plate = 'white' | 'mist' | 'dark' | 'cream' | 'none';

export interface BrandLogo {
  file: string;
  name: string;
  kind: LogoKind;
  /** The card caption — one line, visible before the profile is opened. */
  note: string;
  primary?: boolean;
  plate?: Plate;

  // ── the profile, revealed on expand ──────────────────────────────────────────────────────────
  /** What the mark IS: construction, proportions, what makes it different from its siblings. */
  description: string;
  /** Where to use it. */
  useCases: string[];
  /** Where not to. Empty when there is no trap worth naming. */
  avoid?: string[];
  /** Names in BRAND_COLOURS. Rendered as swatches beside the mark. */
  colours: ColourName[];
  /** Faces visible in the mark, or an honest statement that it is custom lettering. */
  fonts: string[];
  /** Smallest reliable reproduction, when the mark has a real floor. */
  minSize?: string;
  /** Links this mark to its recoloured family, when one exists. */
  recolourSlug?: string;
}

const CUSTOM = 'Custom lettering — not set in a typeface';

export const BRAND_LOGOS: BrandLogo[] = [
  // ── BADGES ──────────────────────────────────────────────────────────────────────────────────
  {
    file: 'badge-primary.png', name: 'Red Ring · Navy Field', kind: 'badge', primary: true, plate: 'white',
    note: 'Red outer ring, red type, solid navy centre with a white star. The default badge.',
    description: 'The fullest expression of the identity: a double ring carrying "STARR" over the top arc and "SURVEYING" under the bottom, two rule pairs at three and nine o\'clock, and a five-point Texas star on a filled navy disc. The filled centre is what separates it from the open variants — it gives the mark a solid core that survives being placed on almost anything.',
    useCases: ['Website header and favicon source', 'Business cards and letterhead', 'Truck doors and yard signs', 'Embroidered patches at 2 inches and up', 'Social profile images'],
    avoid: ['Anything under 1.25 inches — the curved SURVEYING fills in', 'Photographic backgrounds without a solid plate behind it'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: [CUSTOM, 'Closest match for rebuilds: Oswald Bold'],
    minSize: '1.25″ print · 2″ embroidery',
    recolourSlug: 'badge',
  },
  {
    file: 'badge-red-type.png', name: 'Navy Ring · Red Type', kind: 'badge', primary: true, plate: 'white',
    note: 'Navy ring, red type, open white centre. Lighter on the page.',
    description: 'The same construction with the weight redistributed: the ring goes navy, the lettering goes red, and the centre disc is left open so the star reads as line art rather than a solid. Noticeably lighter on the page than the primary, which is the point — it sits on warm and light grounds without dominating them.',
    useCases: ['Cream, khaki and natural-canvas garments', 'Heritage-adjacent print where the full badge would shout', 'Letterheads and invoices', 'Anywhere the badge shares space with photography'],
    avoid: ['Dark garments — the open centre loses its structure'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: [CUSTOM],
    minSize: '1.5″ print',
    recolourSlug: 'badge-open',
  },
  {
    file: 'badge-navy-ring.png', name: 'All Navy · Red Field', kind: 'badge', primary: true, plate: 'white',
    note: 'Navy ring and type over a red centre. The most balanced of the three.',
    description: 'Navy throughout the ring and lettering, with the red moved inward to the centre disc. This inverts the primary\'s colour distribution and is the most balanced of the three: the eye lands on the red star field first and reads the name second, which is the order that works when the mark is seen at speed.',
    useCases: ['Vehicle graphics and signage read at distance', 'Photographic and mid-tone backgrounds', 'Presentation covers', 'Dark garments, where the navy ring holds its edge'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: [CUSTOM],
    minSize: '1.25″ print · 2″ embroidery',
    recolourSlug: 'badge-ring',
  },
  {
    file: 'badge-navy-star.png', name: 'Navy on White', kind: 'badge', plate: 'white',
    note: 'Navy throughout with an open centre. The quietest variant.',
    description: 'A single-hue treatment: everything navy, centre left open. With no red anywhere it is the closest the badge family gets to a neutral mark, and it is the one to reach for when the identity needs to be present without being the loudest thing in the frame.',
    useCases: ['Watermarks on documents', 'Letterhead footers', 'Co-branded material where a partner\'s colour leads', 'One-colour print where cost matters'],
    colours: ['Starr Navy', 'White'],
    fonts: [CUSTOM],
    minSize: '1.5″ print',
    recolourSlug: 'badge-quiet',
  },
  {
    file: 'badge-grid-a.png', name: 'Heavy Navy', kind: 'badge', plate: 'white',
    note: 'Thicker ring weight. The variant that survives embroidery.',
    description: 'Structurally the same badge with every stroke thickened — ring, rules and letterforms. The extra weight is not a style choice; it is what keeps the mark from filling in when a needle rather than a printer is drawing it, and it is the reason this is the file to send an embroiderer.',
    useCases: ['Embroidery digitisation', 'Two-inch stickers and pins', 'Screen print on textured fabric', 'Anything reproduced below 1.5 inches'],
    avoid: ['Large-format print — at size the heavy strokes read as clumsy'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: [CUSTOM],
    minSize: 'Designed for 1″–2″',
    recolourSlug: 'badge-heavy',
  },
  {
    file: 'badge-alt.png', name: 'Colourway Sheet', kind: 'badge', plate: 'white',
    note: 'Nine approved treatments on one sheet.',
    description: 'Not a mark in its own right — a reference sheet showing nine approved badge treatments together: white, navy and red fields crossed with red and navy rings. Its job is comparison, which is a thing you cannot do by opening nine files one at a time.',
    useCases: ['Choosing a variant against a specific garment before a print run', 'Briefing a vendor on the range', 'Internal reference'],
    avoid: ['Never send this to a printer as artwork — it is a contact sheet'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: [CUSTOM],
  },

  // ── LOCKUPS ─────────────────────────────────────────────────────────────────────────────────
  {
    file: 'badge-grid-b.png', name: 'Stacked Lockup', kind: 'lockup', primary: true, plate: 'white',
    note: 'Star above the wordmark, red rule beneath. For square spaces.',
    description: 'The star lifted out of the badge and set above a heavy sans wordmark, with "SURVEYING" letterspaced beneath and a red rule top and bottom. Vertical rather than circular, which makes it the answer for tall or square spaces where the badge would leave dead air at the corners.',
    useCases: ['Shirt backs and hoodie fronts', 'Yard signs and A-frames', 'Social avatars and profile headers', 'The top of a plat sheet', 'Presentation title slides'],
    avoid: ['Very wide spaces — use a banner lockup instead'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: [CUSTOM, 'Closest match for rebuilds: Archivo Black'],
    minSize: '1″ wide',
    recolourSlug: 'stacked',
  },
  {
    file: 'banner-wide.png', name: 'Boxed Banner — Wide', kind: 'lockup', primary: true, plate: 'white',
    note: 'Roundel, wordmark and stars inside a navy keyline on red.',
    description: 'A red panel bounded by a white rule and a navy keyline, with the star roundel at the left and the wordmark running right. Built to be read at speed and from a distance: the panel gives the mark its own ground, so it works on surfaces the firm does not control.',
    useCases: ['Truck doors and tailgates', 'Jobsite banners and fence scrim', 'Website headers', 'Email signatures', 'Sponsor boards'],
    avoid: ['Small sizes — the wordmark is the first thing to go'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: [CUSTOM, 'Closest match for rebuilds: Archivo Black'],
    minSize: '3″ wide',
    recolourSlug: 'banner',
  },
  {
    file: 'banner-box.png', name: 'Boxed Banner — Narrow', kind: 'lockup', plate: 'white',
    note: 'Same construction, tighter box.',
    description: 'The banner with its margins pulled in and the roundel dropped, leaving the wordmark flanked by two stars inside the keyline. Proportionally much wider than it is tall, which suits the strips of space nothing else fits.',
    useCases: ['Bumper stickers', 'Website footers', 'Report spines and headers', 'Pen and lanyard printing'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: [CUSTOM],
    minSize: '2.5″ wide',
    recolourSlug: 'banner-narrow',
  },
  {
    file: 'lockup-horizontal.png', name: 'Roundel Banner', kind: 'lockup', plate: 'white',
    note: 'Roundel at the left, rule running to the wordmark.',
    description: 'The roundel anchors the left end and a white rule carries the eye across to the wordmark. The asymmetry is deliberate — a mark with a heavy end and a light end reads directionally, which helps on a moving vehicle where the viewer has one pass to take it in.',
    useCases: ['Vehicle side panels', 'Wide web banners', 'Event backdrops', 'Letterhead headers'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: [CUSTOM],
    minSize: '3″ wide',
    recolourSlug: 'horizontal',
  },
  {
    file: 'lockup-stacked.png', name: 'Cap Side Wordmark', kind: 'lockup', plate: 'white',
    note: 'The narrow banner for a cap side or sleeve.',
    description: 'A compressed strip built for the panel of a cap or the sleeve of a shirt — places where the available shape is fixed and unusually long. Keep it entirely within one panel; a mark that crosses a seam distorts when the garment is worn.',
    useCases: ['Cap side and back panels', 'Shirt sleeves', 'Bag straps and webbing'],
    avoid: ['Never let it bridge a seam or a mesh join'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: [CUSTOM],
    minSize: '2″ wide',
    recolourSlug: 'capside',
  },
  {
    file: 'lockup-mountain.png', name: 'Mountain Lockup', kind: 'lockup', plate: 'mist',
    note: 'Single colour navy. Outdoorsy rather than institutional.',
    description: 'A different voice entirely: a mountain range with a surveyor at the instrument, over an italic "STARR" and a letterspaced "SURVEYING". One ink and no star. It is the only mark in the library that depicts the work rather than symbolising it, and the only one that is genuinely single-colour by design.',
    useCases: ['One-colour print where cost or process forbids more', 'Embossing, foil and laser engraving', 'Outdoor and recreation contexts', 'Merchandise with a landscape theme'],
    avoid: ['Anywhere the primary identity is required — this is a secondary voice'],
    colours: ['Midnight Navy', 'White'],
    fonts: [CUSTOM, 'Closest match for rebuilds: Oswald Bold Italic'],
    minSize: '1.5″ wide',
    recolourSlug: 'mountain',
  },

  // ── MARKS ───────────────────────────────────────────────────────────────────────────────────
  {
    file: 'roundel-navy.png', name: 'Roundel — Red Field', kind: 'mark', primary: true, plate: 'white',
    note: 'The embroidery workhorse. Four threads, no small type.',
    description: 'A red disc, navy ring, and a two-tone star with a white outline. No lettering at all, which is exactly why it works where the badge does not: there is nothing in it fine enough to fill in. Four thread colours and a hard outer edge make it the cheapest and most reliable mark to embroider.',
    useCases: ['Cap fronts', 'Patches with a merrowed border', 'Chest hits on polos and jackets', 'Anywhere the badge would go below 1.5 inches'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: ['No type in this mark'],
    minSize: '1.5″ embroidered · 0.5″ print',
    recolourSlug: 'roundel',
  },
  {
    file: 'roundel-red.png', name: 'Roundel — Navy Field', kind: 'mark', plate: 'white',
    note: 'The inverse. Use on red garments.',
    description: 'The same construction with the disc and ring swapped: navy field, red ring, white star. It exists for one reason — a red roundel on a red garment disappears — and it is the answer whenever the garment colour is close to the mark\'s own field.',
    useCases: ['Red and maroon garments', 'Light garments where the navy gives more separation', 'Anywhere the red roundel loses its edge'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: ['No type in this mark'],
    minSize: '1.5″ embroidered',
    recolourSlug: 'roundel-navy-field',
  },
  {
    file: 'mark-star.png', name: 'Star Mark', kind: 'mark', plate: 'white',
    note: 'Solid star, white outline, navy ring. The simplest form.',
    description: 'The identity reduced to its irreducible part: the star, outlined in white, inside a navy ring on a red disc. Nothing here depends on being large — it is the mark that still reads at favicon size, and the one to repeat if a pattern or a texture is needed.',
    useCases: ['Favicons and app icons', 'Repeating patterns on linings and packaging', 'Sleeve and collar hits', 'Bullet marks and dividers in documents', 'Map pins and GIS symbology'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: ['No type in this mark'],
    minSize: '16px digital · 0.35″ print',
    recolourSlug: 'star',
  },
  {
    file: 'mark-surveyor.png', name: 'Star + Surveyor', kind: 'mark', plate: 'white',
    note: 'Star with the instrument-operator silhouette.',
    description: 'The star mark with a surveyor at a tripod silhouetted across it. It says what the firm does without a word of copy, which makes it the most self-explanatory mark in the set — and the most specific, so it does not substitute for the badge in formal contexts.',
    useCases: ['Social avatars where the platform shows no name', 'Recruitment and careers material', 'Field-crew merchandise', 'Illustrative use in slides and reports'],
    avoid: ['Formal documents — the silhouette reads as illustration, not identity'],
    colours: ['Starr Red', 'Starr Navy', 'White', 'Ink Black'],
    fonts: ['No type in this mark'],
    minSize: '0.75″ — the silhouette needs the room',
    recolourSlug: 'surveyor',
  },
  {
    file: 'icon-app.png', name: 'App Icon', kind: 'mark', plate: 'mist',
    note: 'Star only, no type. Already deployed.',
    description: 'The production app icon and favicon, cropped and weighted specifically for small square containers: the star is proportionally larger and the ring thinner than in the star mark, because a tile is read at 32 pixels and the usual proportions lose the point of the star.',
    useCases: ['Browser favicon', 'Home-screen and app tiles', 'Notification badges'],
    avoid: ['Do not re-cut it — the crop is tuned and already shipped'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: ['No type in this mark'],
    minSize: '16px',
    recolourSlug: 'icon',
  },
  {
    file: 'wordmark-starr.png', name: '“Starr” Wordmark', kind: 'mark', plate: 'mist',
    note: 'Outlined italic wordmark.',
    description: 'A heavy italic "Starr" in navy with a white outline and a faint red keyline behind it. The outline lets it sit on busy grounds unaided, which is the one thing the badge cannot do. Pairs with the "Surveying" wordmark on a shared baseline.',
    useCases: ['Paired with a roundel where the full badge is too detailed', 'Busy or photographic backgrounds', 'Vehicle and window graphics'],
    avoid: ['Never use it alone — the firm is not called "Starr"'],
    colours: ['Starr Navy', 'Starr Red', 'White'],
    fonts: [CUSTOM, 'Closest match for rebuilds: Archivo Black Italic'],
    minSize: '1″ wide',
    recolourSlug: 'wordmark-starr',
  },
  {
    file: 'wordmark-surveying.png', name: '“Surveying” Wordmark', kind: 'mark', plate: 'mist',
    note: 'The matching second line.',
    description: 'The companion to the "Starr" wordmark, built in the same weight and outline treatment so the two sit together as one lockup. Set them on a shared baseline with matched cap heights — mismatching them is the most common way this pair goes wrong.',
    useCases: ['Second line under the "Starr" wordmark', 'Standalone on merchandise where the star supplies the identity'],
    colours: ['Starr Navy', 'Starr Red', 'White'],
    fonts: [CUSTOM],
    minSize: '1.5″ wide',
    recolourSlug: 'wordmark-surveying',
  },
  {
    file: 'patch-black.jpg', name: 'Reversed on Black', kind: 'mark', plate: 'none',
    note: 'How the identity behaves on a dark ground.',
    description: 'A reference photograph rather than artwork: the roundel and wordmark on black, showing what the white keyline is doing. Without that ring the mark floats and the navy sinks into the ground — which is the single most useful thing to know before ordering anything dark.',
    useCases: ['Reference when specifying dark garments or signage', 'Showing a vendor what the keyline is for'],
    avoid: ['Not artwork — do not send this to a printer'],
    colours: ['Starr Red', 'Starr Navy', 'White', 'Ink Black'],
    fonts: [CUSTOM],
  },

  // ── HERITAGE ────────────────────────────────────────────────────────────────────────────────
  {
    file: 'heritage-gold.png', name: 'Antique Gold', kind: 'heritage', plate: 'cream',
    note: 'Gold field, black rule. The most premium of the set.',
    description: 'A single-hue treatment of the badge: antique gold disc, black ring and lettering, cream ground. The most expensive-looking of the seven heritage colourways and the one that suits foil, embossing and anything meant to feel like an award.',
    useCases: ['Retail merchandise and gift items', 'Foil-stamped covers and certificates', 'Black and cream garments', 'Anniversary and milestone material'],
    avoid: ['Never on a truck, a plat, a business card or the website'],
    colours: ['Ink Black', 'Cream'],
    fonts: [CUSTOM, 'Set companion copy in Alfa Slab One'],
  },
  {
    file: 'heritage-burnt-orange.png', name: 'Burnt Orange', kind: 'heritage', plate: 'cream',
    note: 'Texas through and through.',
    description: 'Burnt orange ring and lettering over a tan disc on cream. The most regionally loaded colourway in the set — it reads as Texas immediately, which is either exactly what a piece needs or a distraction from it.',
    useCases: ['Vintage tees and caps', 'County fair and rodeo material', 'Natural canvas and khaki goods', 'Stickers and enamel pins'],
    avoid: ['Client-facing documents', 'Anywhere alongside Safety Orange — two different jobs'],
    colours: ['Burnt Orange', 'Terracotta', 'Cream'],
    fonts: [CUSTOM, 'Set companion copy in Alfa Slab One'],
  },
  {
    file: 'heritage-terracotta.png', name: 'Terracotta', kind: 'heritage', plate: 'cream',
    note: 'Softer than burnt orange, with a charcoal rule.',
    description: 'Terracotta disc with a charcoal ring and lettering. The friendliest of the seven — warm without the regional weight of burnt orange — which makes it the safest heritage choice when the audience is not exclusively local.',
    useCases: ['Retail merchandise', 'Coffee mugs, coasters, ceramics', 'Cream and oatmeal garments'],
    colours: ['Terracotta', 'Espresso', 'Cream'],
    fonts: [CUSTOM],
  },
  {
    file: 'heritage-maroon.png', name: 'Maroon', kind: 'heritage', plate: 'cream',
    note: 'Deep and formal. Reads as Aggie country.',
    description: 'Deep maroon ring and lettering over a taupe disc. The most formal of the heritage set and the one with a meaning attached: in Central Texas maroon reads as Texas A&M before it reads as anything else.',
    useCases: ['Alumni and university-adjacent events', 'Formal heritage print', 'Leather and waxed-canvas goods'],
    avoid: ['Anywhere the A&M association would confuse the audience'],
    colours: ['Maroon', 'Espresso', 'Cream'],
    fonts: [CUSTOM],
  },
  {
    file: 'heritage-forest.png', name: 'Forest Green', kind: 'heritage', plate: 'cream',
    note: 'Forest rule over a sage field.',
    description: 'Forest green ring and lettering over a sage disc. The most natural-looking of the set and the best match for the olive and tan garments the field crews actually wear, which makes it the heritage colourway with a real working use.',
    useCases: ['Olive, sage and tan garments', 'Outdoor and conservation contexts', 'Field-crew merchandise'],
    colours: ['Forest Green', 'Sage', 'Cream'],
    fonts: [CUSTOM],
  },
  {
    file: 'heritage-brown.png', name: 'Espresso Brown', kind: 'heritage', plate: 'cream',
    note: 'Espresso on taupe. The warm dark for leather, canvas and wood.',
    description: 'Espresso ring and lettering over a taupe disc. The warmest dark in the palette and the one that belongs on hide and waxed cotton — where a true black would look harsh against the material.',
    useCases: ['Leather patches and hat brands', 'Waxed canvas bags and jackets', 'Wood engraving and burning'],
    colours: ['Espresso', 'Khaki', 'Cream'],
    fonts: [CUSTOM],
  },
  {
    file: 'heritage-slate.png', name: 'Slate Blue', kind: 'heritage', plate: 'cream',
    note: 'The one heritage colourway close to the real identity.',
    description: 'Slate blue ring and lettering over a grey disc. The only heritage colourway that stays in the identity\'s own hue family, which makes it the safe one — the piece a client might see without wondering whether they are looking at the same company.',
    useCases: ['Heritage pieces a client may encounter', 'Conference and trade-show merchandise', 'Grey and light-heather garments'],
    colours: ['Slate Blue', 'Steel', 'Cream'],
    fonts: [CUSTOM],
  },

  // ── APPAREL REFERENCE ───────────────────────────────────────────────────────────────────────
  {
    file: 'cap-navy.jpg', name: 'Navy Cap', kind: 'apparel', plate: 'none',
    note: 'The default. Roundel with a white ring on navy.',
    description: 'The red-field roundel embroidered on a navy structured cap. The white outer ring is doing the separation work — on navy the mark\'s own navy ring would vanish into the crown, which is why the outline is not optional.',
    useCases: ['Standard crew and client-gift cap', 'The default for any order where nobody specified'],
    colours: ['Midnight Navy', 'Starr Red', 'White'],
    fonts: ['No type — roundel only'],
    minSize: 'Roundel at 2″',
  },
  {
    file: 'patch-detail.jpg', name: 'Red Cap', kind: 'apparel', plate: 'none',
    note: 'Navy ring, white star on red.',
    description: 'The navy-field roundel on a red cap. Note the choice: the red-field roundel would disappear here, so the inverse is used. This is the clearest working example of why the roundel exists in two colourways.',
    useCases: ['Summer and event caps', 'High-visibility crew identification'],
    avoid: ['Never put a navy-heavy mark on red without white between them'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: ['No type — roundel only'],
  },
  {
    file: 'cap-black.jpg', name: 'Black Cap', kind: 'apparel', plate: 'none',
    note: 'Roundel plus a white side wordmark.',
    description: 'The most versatile crew hat: roundel on the front panel, white wordmark on the side. Black takes every mark in the library and hides jobsite dirt better than navy, which is why it is the one most crews reach for.',
    useCases: ['Everyday crew wear', 'Retail merchandise', 'Anywhere the cap will get dirty'],
    colours: ['Ink Black', 'Starr Red', 'Starr Navy', 'White'],
    fonts: [CUSTOM, 'Side wordmark can be set in Bebas Neue'],
  },
  {
    file: 'cap-olive.jpg', name: 'Olive Drab Cap', kind: 'apparel', plate: 'none',
    note: 'Field-crew favourite.',
    description: 'The roundel on an unstructured olive cap. Olive is a mid-tone, so the white ring is carrying the entire separation — drop it and the mark sits in the fabric. The closest thing the palette has to a camo-adjacent ground.',
    useCases: ['Field crews', 'Hunting and outdoor season merchandise', 'Anywhere near a camo programme'],
    avoid: ['Never place a mark on olive without the white ring'],
    colours: ['Olive Drab', 'Starr Red', 'Starr Navy', 'White'],
    fonts: ['No type — roundel only'],
  },
  {
    file: 'cap-khaki.jpg', name: 'Khaki Cap', kind: 'apparel', plate: 'none',
    note: 'Full-colour roundel on tan.',
    description: 'The full-colour roundel on a khaki cap. The warmest ground in the apparel range and the one that bridges to the heritage colourways — a khaki cap works with both the primary identity and the burnt-orange heritage line.',
    useCases: ['Client gifts', 'Warm-weather field wear', 'Heritage merchandise ranges'],
    colours: ['Khaki', 'Starr Red', 'Starr Navy', 'White'],
    fonts: ['No type — roundel only'],
  },
  {
    file: 'cap-red-trucker.jpg', name: 'Red / Navy Trucker', kind: 'apparel', plate: 'none',
    note: 'Two-tone. Keep the mark on the front panel.',
    description: 'A red front with navy mesh back. Two-tone caps introduce a constraint the solid ones do not: the mark must sit entirely on the front panel, because embroidery across a mesh join puckers and the mark distorts as the cap flexes.',
    useCases: ['Summer crew wear', 'Events and giveaways'],
    avoid: ['Never let the mark bridge onto the mesh'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: ['No type — roundel only'],
  },
  {
    file: 'cap-red.jpg', name: 'Patch Construction', kind: 'apparel', plate: 'none',
    note: 'Merrowed white border, satin-stitch star.',
    description: 'A close-up of the patch build: merrowed white border, satin-stitch star, filled field. This is the construction to specify for camouflage and any textured or multi-tone fabric — the border becomes the mark\'s own background, so the fabric underneath never touches it.',
    useCases: ['Camouflage garments', 'Textured and multi-tone fabrics', 'Anything under 2 inches where direct embroidery would fill in', 'Removable and hook-and-loop applications'],
    colours: ['Starr Red', 'Starr Navy', 'White'],
    fonts: ['No type — roundel only'],
    minSize: '1.5″ with a merrowed edge',
  },
];

export const LOGO_KIND_LABELS: Record<LogoKind, string> = {
  badge: 'Circular badges',
  lockup: 'Lockups',
  mark: 'Marks & wordmarks',
  heritage: 'Heritage colourways',
  apparel: 'Apparel & embroidery',
};

export const LOGO_KIND_INTRO: Record<LogoKind, string> = {
  badge: 'The primary identity. Pick a colourway by the ground it will sit on, not by preference.',
  lockup: 'For anywhere wider than it is tall — truck doors, banners, letterheads, email signatures.',
  mark: 'The marks that work alone, without the company name. Embroidery, favicons, avatars, patterns.',
  heritage: 'One hue plus cream. For merchandise and retail goods — never on a truck, a plat, a card or the website.',
  apparel: 'Real embroidery on real garments. Every one carries a white or light outer ring, and that ring is what separates the mark from the fabric.',
};

export const LOGO_KIND_ORDER: LogoKind[] = ['badge', 'lockup', 'mark', 'heritage', 'apparel'];

export function logosOfKind(kind: LogoKind): BrandLogo[] {
  return BRAND_LOGOS.filter((l) => l.kind === kind);
}

export function logoByFile(file: string): BrandLogo | undefined {
  return BRAND_LOGOS.find((l) => l.file === file);
}

// ── RECOLOURED FAMILIES ─────────────────────────────────────────────────────────────────────────
//
// Generated by `scripts/recolour-brand-marks.mjs` from the red/navy/white originals. Declared here
// rather than listed one file at a time because the set is a product of two lists, and writing 32
// entries by hand is 32 chances to typo a filename that then 404s on the downloads tab.

export interface RecolourWay {
  id: string;
  label: string;
  /** Palette names, so the profile can show the swatches it was built from. */
  colours: ColourName[];
  note: string;
}

export const RECOLOUR_WAYS: RecolourWay[] = [
  { id: 'forest', label: 'Forest Green', colours: ['Forest Green', 'Pine', 'Cream'],
    note: 'Outdoor and conservation contexts. The best match for olive and sage garments.' },
  { id: 'maroon', label: 'Maroon', colours: ['Maroon', 'Espresso', 'Cream'],
    note: 'Formal heritage. Carries an A&M association in Central Texas.' },
  { id: 'burnt', label: 'Burnt Orange', colours: ['Burnt Orange', 'Espresso', 'Cream'],
    note: 'Regional merchandise. Never beside Safety Orange.' },
  { id: 'espresso', label: 'Espresso', colours: ['Espresso', 'Saddle Brown', 'Cream'],
    note: 'Leather, waxed canvas and wood. A softer dark than black.' },
  { id: 'slate', label: 'Slate Blue', colours: ['Slate Blue', 'Midnight Navy', 'Cream'],
    note: 'Closest to the real identity. Safe when a client may see it.' },
  { id: 'olive', label: 'Olive Drab', colours: ['Olive Drab', 'Pine', 'Cream'],
    note: 'Field wear and anything near a camo programme.' },
  { id: 'mono-dark', label: 'One Colour', colours: ['Midnight Navy', 'White'],
    note: 'Single ink. The cheapest to reproduce and the widest-working of the set.' },
  { id: 'mono-light', label: 'Reversed', colours: ['White', 'Midnight Navy'],
    note: 'Knocked out of a navy ground. For dark garments and dark signage.' },
];

export interface RecolourMark {
  slug: string;
  label: string;
  /** The original this family was generated from. */
  source: string;
}

/**
 * The families that exist, DERIVED from the marks that declare a slug.
 *
 * It was a hand-written list of four while `recolour-brand-marks.mjs` was generating eighteen.
 * Nothing failed: the fourteen missing families sat in `public/branding` as 112 files that no
 * profile offered and no download reached — the *authored but not wired* shape again, this time
 * with the artwork already rendered and paid for.
 *
 * Deriving it removes the way that happens. A mark carries its own `recolourSlug`, the colourway
 * strip on its profile is driven by that field, and this list is the same field collected — so a
 * family cannot be generated, shown on a profile, and missing from the browsable index at once.
 * `brand-system.test.ts` holds the result against the generator's own MARKS table, which is the
 * only remaining place the two could disagree.
 */
export const RECOLOUR_MARKS: RecolourMark[] = BRAND_LOGOS
  .filter((l) => l.recolourSlug)
  .map((l) => ({ slug: l.recolourSlug!, label: l.name, source: l.file }));

export function recolourFile(slug: string, wayId: string): string {
  return `recolour-${slug}-${wayId}.png`;
}

/** Every generated file, for the manifest test and the downloads tab. */
export function allRecolourFiles(): string[] {
  return RECOLOUR_MARKS.flatMap((m) => RECOLOUR_WAYS.map((w) => recolourFile(m.slug, w.id)));
}

/** Where the files live. One constant so the page and the export script cannot disagree. */
export const BRANDING_ASSET_BASE = '/branding';

/**
 * The download sizes offered for every mark.
 *
 * Lives here rather than in the route because a Next.js route file may only export HTTP handlers
 * and a short list of config keys — an `export const` beside `GET` fails the build with a type
 * error about `OmitWithTag`, which is not a message that points at the cause. It also belongs
 * here on the merits: the picker in the UI and the validator in the route are the same list, and
 * two copies would let the UI offer a size the API rounds away.
 */
export const ASSET_SIZES = [2048, 1024, 512, 256, 128] as const;

/** The URL that serves `file` resized to `width`. One builder, so the UI and the route agree. */
export function assetUrl(file: string, width: number): string {
  return `/api/admin/branding/asset?file=${encodeURIComponent(file)}&w=${width}`;
}

export function logoSrc(file: string): string {
  return `${BRANDING_ASSET_BASE}/${file}`;
}
