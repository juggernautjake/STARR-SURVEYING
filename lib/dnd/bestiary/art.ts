// lib/dnd/bestiary/art.ts — deciding what picture a creature may have (B2-3).
//
// Owner, 2026-07-29: *"You are welcome to use any artwork that is representative of the creature for their
// statblock and thumbnail."* Read as: it need not be the canonical illustration — anything that clearly
// depicts the creature is fine. Which is what makes this tractable, because the canonical illustrations
// are exactly the ones nobody can license.
//
// ── THE BOUNDARY, AND WHY IT IS IN CODE RATHER THAN IN A COMMENT ─────────────────────────────────────
//
// `/dnd` is publicly reachable by direct link, so anything shown there is published, not personal use. The
// stat blocks are CC-BY SRD text; the ILLUSTRATIONS in the published books are not licensed at all and
// there is no version of "just use them" that is not republishing someone else's art.
//
// Note the shortcut this closes: the SRD JSON carries an `image` path for all 334 creatures and those files
// serve fine. But the SRD contains no artwork — the publishing project states its CODE is MIT and the
// UNDERLYING MATERIAL is OGL 1.0a, and neither covers those PNGs. A licence we cannot state is one we
// cannot use, so `isAcceptableLicence` decides in one place instead of at each call site.
//
// What IS available is deep: public-domain natural history illustration (bears, wolves, serpents, spiders,
// raptors), public-domain mythological engraving (dragons, hydras, demons, giants), and CC-licensed
// photography — all on Wikimedia Commons with the licence attached as structured data.
//
// PURE. The fetcher lives in `scripts/fetch-creature-art.mjs`; this module decides *what to search for* and
// *what may be kept*, which are the two judgements worth arguing with and the two a test can pin.

/** What Commons tells us about a file, reduced to what the decision needs. */
export interface CandidateImage {
  title: string;
  url: string;
  descriptionUrl: string;
  /** Commons' short licence name: 'cc-by-sa-4.0', 'pd-old-100', 'cc0'. */
  licenceShortName: string | null;
  artist: string | null;
  width: number;
  height: number;
  mime: string;
}

export interface AcceptedImage {
  url: string;
  licence: string;
  attribution: string;
  sourceUrl: string;
}

// ── licences ────────────────────────────────────────────────────────────────────────────────────────
//
// ALLOWLIST, NOT A BLOCKLIST. A blocklist says yes to everything nobody thought of, which for licensing is
// the wrong default: the failure mode is publishing someone's work without permission, and the cost of a
// false negative is one creature falling back to a generated sigil.

const ACCEPTABLE = [
  /^cc0/,
  /^cc-by(-sa)?(-\d|$)/,       // cc-by-4.0, cc-by-sa-3.0, cc-by
  /^pd(-|$)/,                  // pd-old-100, pd-us, pd-art
  /^public-domain/,
  /^attribution$/,             // Commons' plain "Attribution" template
  // Flickr Commons' "no known copyright restrictions", applied by institutions (British Library, national
  // archives) to material they have determined is free to use. Found in the refusal tally of a real run,
  // where it was throwing away perfectly usable museum scans — the licence names in the allowlist were
  // written from what SPDX calls things, and Commons has templates SPDX has never heard of.
  /^no-known-copyright/,
  /^no-restrictions$/,
];

/** NC and ND are not acceptable: this is a public site (a commercial reading is at least arguable), and ND
 *  forbids the thumbnailing every listing does. "Fair use" and "non-free" are self-evidently out. GFDL is
 *  excluded because its attribution burden does not suit a thumbnail grid. */
const REFUSED = [/(^|-)nc(-|$)/, /(^|-)nd(-|$)/, /noncommercial/, /no-deriv/, /fair/, /non-free/, /gfdl/];

/**
 * Commons writes licence names for HUMANS, not for matching: the API returns `"CC BY-SA 4.0"`,
 * `"Public domain"`, `"CC BY 3.0"` — spaces, mixed case, inconsistent hyphenation. Matching the SPDX-style
 * `cc-by-sa-4.0` against those refuses two out of every three legitimate images, which was the state of
 * this file until a real query was run against it.
 *
 * So normalise first: lowercase, and every run of spaces/underscores becomes a single hyphen.
 */
function normaliseLicence(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
}

export function isAcceptableLicence(shortName: string | null | undefined): boolean {
  const s = (shortName ?? '').trim();
  if (!s) return false;                       // unstated is not permissive — it is unknown
  const n = normaliseLicence(s);
  if (REFUSED.some((r) => r.test(n))) return false;
  return ACCEPTABLE.some((r) => r.test(n));
}

/**
 * The credit line to store.
 *
 * CC-BY requires the author where one is known; public-domain files often have none, and inventing
 * "Unknown" reads as though we did not look. The Commons page is always cited, because that is where a
 * reader verifies the claim.
 */
export function attributionFor(c: CandidateImage): string {
  const licence = (c.licenceShortName ?? 'unknown').toUpperCase();
  const who = c.artist?.replace(/<[^>]*>/g, '').trim();
  return who
    ? `${who} — ${licence}, via Wikimedia Commons (${c.descriptionUrl})`
    : `${licence}, via Wikimedia Commons (${c.descriptionUrl})`;
}

/** Accept a candidate, or say why not. Returning the reason rather than a boolean is what lets the run
 *  report honest coverage (G6) instead of a silent count. */
export function acceptImage(c: CandidateImage): { ok: true; image: AcceptedImage } | { ok: false; why: string } {
  if (!/^image\/(jpeg|png|webp)$/i.test(c.mime)) return { ok: false, why: `unusable format ${c.mime}` };
  // Below this a thumbnail looks worse than the generated sigil it would replace.
  if (c.width < 200 || c.height < 200) return { ok: false, why: `too small (${c.width}×${c.height})` };
  if (!isAcceptableLicence(c.licenceShortName)) {
    return { ok: false, why: `licence not usable: ${c.licenceShortName ?? 'unstated'}` };
  }
  return {
    ok: true,
    image: {
      url: c.url,
      licence: (c.licenceShortName ?? '').toUpperCase(),
      attribution: attributionFor(c),
      sourceUrl: c.descriptionUrl,
    },
  };
}

// ── what to search for ──────────────────────────────────────────────────────────────────────────────
//
// A creature's NAME is often the wrong query. "Goblin" on Commons returns folklore illustration, which is
// fine; "Commoner" returns nothing useful at all; "Adult Red Dragon" returns nothing, while "dragon" and
// "European dragon" return engravings. And several D&D names are real animals wearing a qualifier —
// "Giant Poisonous Snake" is a snake.

/** Words that describe SIZE or AGE rather than the creature, and only get in the way of a search. */
const QUALIFIERS = /\b(adult|ancient|young|giant|greater|lesser|dire|swarm of|awakened|half|elder)\b/gi;

/**
 * Real animals, queried by SCIENTIFIC NAME.
 *
 * ── WHY THIS TABLE EXISTS, WRITTEN AFTER THROWING AWAY 40 IMAGES ─────────────────────────────────────
 *
 * A live run accepted 40 correctly-licensed images and three of the four inspected were wrong: the **Lich**
 * got a pulsar planetary system (PSR B1257+12 is nicknamed "Lich"), the **Magma Worm** got C. elegans under
 * a microscope, the **Ancient Silver Dragon** got a calligraphy brush. No metadata field distinguishes any
 * of those from a correct hit.
 *
 * Checking real animals afterwards showed a clean split: `Wolf` and `Giant Spider` returned excellent
 * portraits, while **`Giant Rat` returned a giant inflatable protest rat photographed through a car
 * windscreen** — because that phrase names a famous object.
 *
 * So the reliable query is not the creature's name at all: it is the SPECIES. "Canis lupus" cannot match an
 * inflatable, a nickname, or a decorative motif. That is what makes this subset safe to automate while
 * every fantasy name stays a human judgement.
 *
 * Curated, not derived. A mapping this consequential should be arguable line by line, and the entries
 * marked with a genus rather than a species are the ones where D&D's creature is a category ("Spider")
 * rather than an animal.
 */
export const ANIMAL_SPECIES: Record<string, string> = {
  ape: 'Pan troglodytes', 'giant ape': 'Gorilla beringei',
  baboon: 'Papio', badger: 'Meles meles', 'giant badger': 'Meles meles',
  bat: 'Chiroptera', 'giant bat': 'Pteropus',
  'black bear': 'Ursus americanus', 'brown bear': 'Ursus arctos', 'polar bear': 'Ursus maritimus',
  boar: 'Sus scrofa', 'giant boar': 'Sus scrofa',
  camel: 'Camelus dromedarius', cat: 'Felis catus',
  'giant centipede': 'Scolopendra',
  crab: 'Brachyura', 'giant crab': 'Brachyura',
  crocodile: 'Crocodylus niloticus', 'giant crocodile': 'Crocodylus porosus',
  deer: 'Cervus elaphus', elk: 'Cervus canadensis', 'giant elk': 'Alces alces',
  'draft horse': 'Equus caballus', 'riding horse': 'Equus caballus', warhorse: 'Equus caballus',
  pony: 'Equus caballus', mule: 'Equus asinus',
  eagle: 'Aquila chrysaetos', 'giant eagle': 'Aquila chrysaetos',
  elephant: 'Loxodonta africana', mammoth: 'Mammuthus',
  frog: 'Rana temporaria', 'giant frog': 'Rana catesbeiana', 'giant toad': 'Bufo bufo',
  goat: 'Capra aegagrus hircus', 'giant goat': 'Capra ibex',
  hawk: 'Accipiter', 'blood hawk': 'Accipiter',
  hyena: 'Crocuta crocuta', 'giant hyena': 'Crocuta crocuta',
  jackal: 'Canis aureus',
  'killer whale': 'Orcinus orca',
  lion: 'Panthera leo', tiger: 'Panthera tigris', panther: 'Panthera pardus',
  'saber-toothed tiger': 'Smilodon',
  lizard: 'Lacertidae', 'giant lizard': 'Varanus',
  mastiff: 'Canis lupus familiaris',
  octopus: 'Octopus vulgaris', 'giant octopus': 'Enteroctopus dofleini',
  owl: 'Strix aluco', 'giant owl': 'Bubo bubo',
  // "Rat" alone is safe; "Giant Rat" is the phrase that returns the inflatable, so BOTH map to the species.
  rat: 'Rattus norvegicus', 'giant rat': 'Rattus norvegicus', 'giant rat (diseased)': 'Rattus norvegicus',
  raven: 'Corvus corax',
  rhinoceros: 'Ceratotherium simum',
  scorpion: 'Scorpiones', 'giant scorpion': 'Pandinus imperator',
  'sea horse': 'Hippocampus', 'giant sea horse': 'Hippocampus',
  shark: 'Carcharodon carcharias', 'giant shark': 'Carcharodon carcharias',
  'hunter shark': 'Carcharhinus', 'reef shark': 'Carcharhinus perezi',
  snake: 'Serpentes', 'poisonous snake': 'Vipera berus', 'giant poisonous snake': 'Naja',
  'constrictor snake': 'Boa constrictor', 'giant constrictor snake': 'Python reticulatus',
  'flying snake': 'Chrysopelea',
  spider: 'Araneae', 'giant spider': 'Nephila', 'giant wolf spider': 'Lycosidae',
  'giant wasp': 'Vespa',
  // NOT 'Lampyridae' — that is also the MBB Lampyridae, a German stealth aircraft prototype, and Commons
  // returned a photograph of one hanging in a museum. A GENUS CAN COLLIDE WITH A MACHINE; the species is
  // narrower and safer.
  'giant fire beetle': 'Lampyris noctiluca',
  vulture: 'Gyps fulvus', 'giant vulture': 'Gyps',
  weasel: 'Mustela nivalis', 'giant weasel': 'Mustela',
  wolf: 'Canis lupus', 'dire wolf': 'Canis dirus',
  plesiosaurus: 'Plesiosaurus', triceratops: 'Triceratops', 'tyrannosaurus rex': 'Tyrannosaurus',
  quipper: 'Piranha',

  // ── B6-5: the wider corpus's real animals ──────────────────────────────────────────────────────────
  //
  // Tome of Beasts, Monstrous Menagerie, Black Flag and the Pathfinder bestiaries carry hundreds more
  // ordinary animals than the SRD did, and every one of them is a creature Commons photographs reliably.
  // Binomials throughout, per the B2-3 finding that a bare GENUS is a coin toss — `Lampyridae` returned a
  // stealth aircraft — while a species name cannot collide with a machine.
  alligator: 'Alligator mississippiensis', 'alligator turtle': 'Macrochelys temminckii',
  'giant snapping turtle': 'Macrochelys temminckii', 'snapping turtle': 'Chelydra serpentina',
  bison: 'Bison bison', bull: 'Bos taurus', 'cave bear': 'Ursus spelaeus', 'grizzly bear': 'Ursus arctos horribilis',
  'bottlenose dolphin': 'Tursiops truncatus', 'blue-ringed octopus': 'Hapalochlaena lunulata',
  'reef octopus': 'Octopus cyanea', 'vampire squid': 'Vampyroteuthis infernalis',
  'giant squid': 'Architeuthis dux', 'electric eel': 'Electrophorus electricus',
  'giant moray eel': 'Gymnothorax javanicus', 'goblin shark': 'Mitsukurina owstoni',
  'great white shark': 'Carcharodon carcharias', megalodon: 'Otodus megalodon',
  'harbor seal': 'Phoca vitulina', 'leopard seal': 'Hydrurga leptonyx',
  'manta ray': 'Mobula birostris', stingray: 'Dasyatis', swordfish: 'Xiphias gladius',
  stonefish: 'Synanceia verrucosa', pufferfish: 'Takifugu rubripes', 'giant pufferfish': 'Arothron stellatus',
  narwhal: 'Monodon monoceros', orca: 'Orcinus orca',
  gorilla: 'Gorilla gorilla', 'ghost ape': 'Gorilla beringei', monkey: 'Macaca fuscata',
  kangaroo: 'Macropus rufus', meerkat: 'Suricata suricatta', skunk: 'Mephitis mephitis',
  'giant skunk': 'Mephitis mephitis', wolverine: 'Gulo gulo', 'giant wolverine': 'Gulo gulo',
  leopard: 'Panthera pardus', 'snow cat': 'Panthera uncia', moose: 'Alces alces',
  'musk deer': 'Moschus moschiferus', 'red fox': 'Vulpes vulpes', 'fennec fox': 'Vulpes zerda',
  'cunning fox': 'Vulpes vulpes', hippopotamus: 'Hippopotamus amphibius',
  'woolly rhinoceros': 'Coelodonta antiquitatis', 'guard dog': 'Canis lupus familiaris',
  'riding dog': 'Canis lupus familiaris', 'giant armadillo': 'Priodontes maximus',
  'giant sloth': 'Megatherium americanum', 'three-toed sloth': 'Bradypus variegatus',
  'giant pangolin': 'Smutsia gigantea', 'dire pangolin': 'Smutsia gigantea',
  'giant mongoose': 'Herpestes edwardsii', 'giant porcupine': 'Hystrix cristata',
  'giant opossum': 'Didelphis virginiana', 'giant flying squirrel': 'Petaurista petaurista',
  'giant chameleon': 'Furcifer oustaleti', 'giant gecko': 'Gekko gecko',
  'giant monitor lizard': 'Varanus komodoensis', 'giant frilled lizard': 'Chlamydosaurus kingii',
  python: 'Python reticulatus', titanoboa: 'Titanoboa', 'giant anaconda': 'Eunectes murinus',
  viper: 'Vipera berus', 'giant viper': 'Bitis gabonica', 'sea snake': 'Hydrophis',
  'emperor cobra': 'Ophiophagus hannah', 'rat snake swarm': 'Pantherophis obsoletus',
  'terror bird': 'Phorusrhacos', 'war ostrich': 'Struthio camelus',
  'great gray owl': 'Strix nebulosa', 'forest falcon': 'Micrastur', 'archaeopteryx': 'Archaeopteryx',
  'giant honey bee': 'Apis mellifera', 'giant stag beetle': 'Lucanus cervus',
  'giant tarantula': 'Theraphosa blondi', 'giant mantis': 'Mantis religiosa',
  'deadly mantis': 'Mantis religiosa', 'giant mantis shrimp': 'Odontodactylus scyllarus',
  'giant dragonfly': 'Anisoptera', 'giant tardigrade': 'Tardigrada',
  'giant cockroach': 'Blaberus giganteus', 'giant tick': 'Ixodes ricinus',
  'giant leech': 'Hirudo medicinalis', 'giant slug': 'Limax maximus',
  'giant hermit crab': 'Coenobita brevimanus', trilobite: 'Trilobita',
  'common eurypterid': 'Eurypterus', helicoprion: 'Helicoprion',

  // Dinosaurs and prehistoric mammals. Fossil mounts rather than photographs, necessarily — B2-3 recorded
  // that as a deliberate outcome rather than a defect: Commons has no photograph of a Smilodon because
  // none can exist, and a museum skeleton is the truthful best available.
  allosaurus: 'Allosaurus', ankylosaurus: 'Ankylosaurus', brontosaurus: 'Brontosaurus',
  carnotaurus: 'Carnotaurus', compsognathus: 'Compsognathus', deinonychus: 'Deinonychus',
  deinosuchus: 'Deinosuchus', diplodocus: 'Diplodocus', elasmosaurus: 'Elasmosaurus',
  iguanodon: 'Iguanodon', majungasaurus: 'Majungasaurus', nodosaurus: 'Nodosaurus',
  pachycephalosaurus: 'Pachycephalosaurus', platecarpus: 'Platecarpus', protoceratops: 'Protoceratops',
  pteranodon: 'Pteranodon', quetzalcoatlus: 'Quetzalcoatlus', spinosaurus: 'Spinosaurus',
  stegosaurus: 'Stegosaurus', therizinosaurus: 'Therizinosaurus', troodon: 'Troodon',
  tylosaurus: 'Tylosaurus', velociraptor: 'Velociraptor', tyrannosaurus: 'Tyrannosaurus',
  anancus: 'Anancus', daeodon: 'Daeodon', gigantopithecus: 'Gigantopithecus',
  hyaenodon: 'Hyaenodon', lystrosaurus: 'Lystrosaurus', mastodon: 'Mammut americanum',
  megalania: 'Varanus priscus', megalictis: 'Megalictis', megantereon: 'Megantereon',
  megatherium: 'Megatherium', smilodon: 'Smilodon',
};

/**
 * Publishers write a creature's name for an INDEX, not for a sentence.
 *
 * Pathfinder and the SRD's own listings invert it — `Bear, Black`, `Ape, Giant`, `Swarm of Rats` — and an
 * exact-match table lookup misses every one. That is not a handful: the catalogue holds `Bear, Black`,
 * `Bear, Brown`, `Bear, Polar`, `Rat, Giant`, `Ape, Giant`, `Spider, Giant Wolf` and dozens more, all of
 * which the table already had entries for under their spoken names.
 *
 * So the comma is un-inverted and a leading `Swarm of` / `Insect,` style prefix dropped, and the result is
 * tried against the table. This is a NAMING convention, not a synonym list — writing out `bear, black` as
 * its own key would double the table and let the two halves drift.
 */
export function spokenName(name: string): string {
  let n = name.trim().toLowerCase();

  // A swarm is a PRESENTATION of an animal, not a different animal — "Swarm of Rats" wants a photograph of
  // a rat.
  //
  // FIRST, and that ordering is the whole of it. Run after the comma rule, `Rat, Swarm of Rats` has already
  // become "swarm of rats rat" and the capture swallows the duplicated head, yielding "rats rat" — which
  // matches nothing. Taking the swarm phrase off the ORIGINAL name sidesteps the interaction entirely,
  // and every `X, Swarm of Xs` in the catalogue names the same animal twice anyway.
  const swarmOf = n.match(/swarm of ([a-z' -]+)$/);
  if (swarmOf) return swarmOf[1].trim().replace(/(?<!s)s$/, '');

  // `Insect, Giant Scorpion` leads with a CATEGORY, which simply drops. `Bear, Black` leads with the
  // ANIMAL, so the two halves swap. What decides it is which kind of word the head is, not its position.
  const CATEGORIES = new Set(['insect', 'dinosaur', 'animal', 'beast', 'swarm']);
  const comma = n.match(/^([a-z' -]+),\s*(.+)$/);
  if (comma) {
    const [, head, tail] = comma;
    n = CATEGORIES.has(head) ? tail : `${tail} ${head}`;
  }

  return n.replace(/\s+/g, ' ').trim();
}


/** The species query for a creature, or null when it is not a real animal. Null is the common case and
 *  means "a human has to pick this one". */
export function speciesQueryFor(name: string): string | null {
  const raw = name.trim().toLowerCase();
  return ANIMAL_SPECIES[raw] ?? ANIMAL_SPECIES[spokenName(name)] ?? null;
}

/**
 * Search terms for one creature, best first.
 *
 * A REAL ANIMAL SHORT-CIRCUITS TO ITS SPECIES and nothing else, because the whole point of the table above
 * is that the common name is what goes wrong. Falling through to "Giant Rat" after "Rattus norvegicus"
 * missed would reintroduce the inflatable.
 *
 * For everything else several terms are tried, because Commons is uneven: the specific term is best when it
 * hits, and the generic fallback stops a whole type rendering as sigils. A creature with no usable hit is
 * not a failure — `sigilFor` covers it, which is what lets this refuse anything doubtful.
 */
export function searchTermsFor(name: string, type?: string | null): string[] {
  const species = speciesQueryFor(name);
  if (species) return [species];

  const clean = name.replace(/\(.*?\)/g, '').trim();
  const stripped = clean.replace(QUALIFIERS, '').replace(/\s+/g, ' ').trim();
  const terms: string[] = [];

  const push = (t: string | undefined | null) => {
    const v = (t ?? '').trim();
    if (v && v.length > 2 && !terms.some((x) => x.toLowerCase() === v.toLowerCase())) terms.push(v);
  };

  push(clean);
  push(stripped);
  // The last word is usually the noun: "Giant Poisonous Snake" → "Snake", "Adult Red Dragon" → "Dragon".
  const head = stripped.split(/\s+/).pop();
  if (head && head.toLowerCase() !== stripped.toLowerCase()) push(head);
  // The type is the widest net, and the one that keeps a whole category from being empty.
  push(type ?? undefined);
  return terms;
}
