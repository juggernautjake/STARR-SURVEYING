// worker/src/services/address-utils.ts — Stage 0: Address Normalization
// Geocodes raw addresses via Nominatim → Census → manual parse, then generates
// 15+ search variants (including partial/fuzzy) for county CAD queries.
// Every variant costs almost nothing to try, so we generate aggressively.

import type { NormalizedAddress, AddressVariant, ParsedAddress } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';

// ── Road Abbreviation Maps ─────────────────────────────────────────────────

/** Long-form → short-form for Texas road types (from geocoders) */
const ROAD_EXPANSIONS: Record<string, string> = {
  'Farm-to-Market Road': 'FM',
  'Farm to Market Road': 'FM',
  'Farm-to-Market': 'FM',
  'Farm to Market': 'FM',
  'State Highway': 'SH',
  'State Hwy': 'SH',
  'County Road': 'CR',
  'Ranch Road': 'RR',
  'Ranch-to-Market Road': 'RM',
  'Ranch to Market Road': 'RM',
  'Ranch-to-Market': 'RM',
  'US Highway': 'US',
  'U.S. Highway': 'US',
  'United States Highway': 'US',
  'Interstate Highway': 'IH',
  'Interstate': 'IH',
  'Business Route': 'BR',
  'Spur': 'SPUR',
  'Loop': 'LOOP',
  'Park Road': 'PR',
  'Recreational Road': 'RE',
};

/** Short-form → all possible expansions (for trying reversed lookups) */
const ROAD_SHORT_TO_LONG: Record<string, string[]> = {
  FM: ['FM', 'Farm to Market Road', 'Farm-to-Market Road', 'Farm to Market', 'FM RD', 'FM Road'],
  SH: ['SH', 'State Highway', 'State Hwy', 'Highway'],
  CR: ['CR', 'County Road', 'County Rd', 'Co Road', 'Co Rd'],
  RR: ['RR', 'Ranch Road', 'Ranch Rd'],
  RM: ['RM', 'Ranch to Market Road', 'Ranch-to-Market Road', 'Ranch to Market'],
  US: ['US', 'US Highway', 'US Hwy', 'Hwy'],
  IH: ['IH', 'Interstate', 'Interstate Highway', 'I'],
  HWY: ['HWY', 'Highway', 'Hwy'],
};

/** Street type abbreviations ↔ expansions (bidirectional) */
const STREET_TYPE_MAP: Record<string, string[]> = {
  St: ['St', 'Street', 'ST', 'STR'],
  Ave: ['Ave', 'Avenue', 'AV', 'AVE'],
  Blvd: ['Blvd', 'Boulevard', 'BLVD'],
  Dr: ['Dr', 'Drive', 'DR', 'DRV'],
  Ln: ['Ln', 'Lane', 'LN'],
  Rd: ['Rd', 'Road', 'RD'],
  Ct: ['Ct', 'Court', 'CT'],
  Cir: ['Cir', 'Circle', 'CIR'],
  Pl: ['Pl', 'Place', 'PL'],
  Way: ['Way', 'WAY', 'WY'],
  Trl: ['Trl', 'Trail', 'TRL'],
  Ter: ['Ter', 'Terrace', 'TER'],
  Pkwy: ['Pkwy', 'Parkway', 'PKWY'],
  Hwy: ['Hwy', 'Highway', 'HWY'],
  Loop: ['Loop', 'LOOP', 'LP'],
  Pass: ['Pass', 'PASS'],
  Run: ['Run', 'RUN'],
  Xing: ['Xing', 'Crossing', 'XING'],
  Cv: ['Cv', 'Cove', 'CV'],
  Pt: ['Pt', 'Point', 'PT'],
  Holw: ['Holw', 'Hollow', 'HOLW'],
};

/** Ordinal number words → digits and vice versa */
const ORDINALS: Record<string, string> = {
  first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th',
  sixth: '6th', seventh: '7th', eighth: '8th', ninth: '9th', tenth: '10th',
  eleventh: '11th', twelfth: '12th', thirteenth: '13th',
};
const ORDINALS_REVERSE: Record<string, string> = {};
for (const [word, digit] of Object.entries(ORDINALS)) {
  ORDINALS_REVERSE[digit.toLowerCase()] = word.charAt(0).toUpperCase() + word.slice(1);
}

/** Directional patterns */
const DIRECTIONS: Record<string, string[]> = {
  N: ['N', 'North', 'No'],
  S: ['S', 'South', 'So'],
  E: ['E', 'East'],
  W: ['W', 'West'],
  NE: ['NE', 'Northeast', 'North East'],
  NW: ['NW', 'Northwest', 'North West'],
  SE: ['SE', 'Southeast', 'South East'],
  SW: ['SW', 'Southwest', 'South West'],
};

const DIRECTIONAL_ABBREV_RE = /^(North|South|East|West|Northeast|Northwest|Southeast|Southwest|NE|NW|SE|SW|N|S|E|W)\b/i;
const DIRECTIONAL_SUFFIX_RE = /\b(North|South|East|West|Northeast|Northwest|Southeast|Southwest|NE|NW|SE|SW|N|S|E|W)$/i;

// ── Texas City → County Mapping ────────────────────────────────────────────
// Covers ~143 Texas counties within 200-mile radius of Belton (Bell County)
// Organized by concentric rings from Bell County center

const CITY_TO_COUNTY: Record<string, string> = {
  // ═══ RING 0: Bell County (center) ═══
  belton: 'Bell', temple: 'Bell', killeen: 'Bell', harker_heights: 'Bell',
  copperas_cove: 'Bell', nolanville: 'Bell', salado: 'Bell', rogers: 'Bell',
  troy: 'Bell', holland: 'Bell', little_river_academy: 'Bell', morgans_point_resort: 'Bell',

  // ═══ RING 1: Adjacent counties (~0-30 mi) ═══
  // Coryell County
  gatesville: 'Coryell', evant: 'Coryell', oglesby: 'Coryell', flat: 'Coryell',
  // McLennan County
  waco: 'McLennan', woodway: 'McLennan', hewitt: 'McLennan',
  robinson: 'McLennan', mcgregor: 'McLennan', lorena: 'McLennan',
  china_spring: 'McLennan', west: 'McLennan', mart: 'McLennan',
  moody: 'McLennan', bruceville_eddy: 'McLennan', lacy_lakeview: 'McLennan',
  // Falls County
  marlin: 'Falls', rosebud: 'Falls', lott: 'Falls',
  // Milam County
  cameron: 'Milam', rockdale: 'Milam', thorndale: 'Milam', milano: 'Milam',
  // Williamson County
  georgetown: 'Williamson', round_rock: 'Williamson', cedar_park: 'Williamson',
  leander: 'Williamson', taylor: 'Williamson', liberty_hill: 'Williamson',
  hutto: 'Williamson', jarrell: 'Williamson', florence: 'Williamson',
  granger: 'Williamson', bartlett: 'Williamson', thrall: 'Williamson',
  // Burnet County
  burnet: 'Burnet', marble_falls: 'Burnet', bertram: 'Burnet',
  granite_shoals: 'Burnet', cottonwood_shores: 'Burnet',
  // Lampasas County
  lampasas: 'Lampasas', lometa: 'Lampasas', kempner: 'Lampasas',
  // Hamilton County
  hamilton: 'Hamilton', hico: 'Hamilton',

  // ═══ RING 2: ~30-60 mi ═══
  // Travis County
  austin: 'Travis', pflugerville: 'Travis', del_valle: 'Travis',
  manor: 'Travis', bee_cave: 'Travis', lakeway: 'Travis',
  west_lake_hills: 'Travis', rollingwood: 'Travis',
  // Bosque County
  meridian: 'Bosque', clifton: 'Bosque', valley_mills: 'Bosque',
  // Hill County
  hillsboro: 'Hill', whitney: 'Hill', itasca: 'Hill',
  // Limestone County
  groesbeck: 'Limestone', mexia: 'Limestone',
  // Robertson County
  hearne: 'Robertson', calvert: 'Robertson', franklin: 'Robertson',
  // Lee County
  giddings: 'Lee', lexington: 'Lee',
  // Llano County
  llano: 'Llano', kingsland: 'Llano', horseshoe_bay: 'Llano',
  // Mills County
  goldthwaite: 'Mills', mullin: 'Mills',
  // San Saba County
  san_saba: 'San Saba', richland_springs: 'San Saba',
  // Bastrop County
  bastrop: 'Bastrop', elgin: 'Bastrop', smithville: 'Bastrop',
  // Hays County
  san_marcos: 'Hays', kyle: 'Hays', buda: 'Hays',
  wimberley: 'Hays', dripping_springs: 'Hays',

  // ═══ RING 3: ~60-100 mi ═══
  // Brazos County
  bryan: 'Brazos', college_station: 'Brazos',
  // Burleson County
  caldwell_burleson: 'Burleson', somerville: 'Burleson',
  // Blanco County
  johnson_city: 'Blanco', blanco: 'Blanco',
  // Comal County
  new_braunfels: 'Comal', bulverde: 'Comal', canyon_lake: 'Comal',
  garden_ridge: 'Comal', spring_branch: 'Comal',
  // Guadalupe County
  seguin: 'Guadalupe', cibolo: 'Guadalupe', schertz_guadalupe: 'Guadalupe',
  // Freestone County
  fairfield: 'Freestone', teague: 'Freestone',
  // Navarro County
  corsicana: 'Navarro', kerens: 'Navarro', dawson: 'Navarro',
  // Somervell County
  glen_rose: 'Somervell',
  // Comanche County
  comanche: 'Comanche', de_leon: 'Comanche',
  // Brown County
  brownwood: 'Brown', early: 'Brown', bangs: 'Brown',
  // McCulloch County
  brady: 'McCulloch', rochelle: 'McCulloch',
  // Mason County
  mason: 'Mason',
  // Leon County
  centerville: 'Leon', buffalo: 'Leon', jewett: 'Leon',
  // Madison County
  madisonville: 'Madison', midway: 'Madison',
  // Washington County
  brenham: 'Washington', chappell_hill: 'Washington', burton: 'Washington',
  // Fayette County
  la_grange: 'Fayette', schulenburg: 'Fayette', flatonia: 'Fayette',
  // Caldwell County
  lockhart: 'Caldwell', luling: 'Caldwell', martindale: 'Caldwell',
  // Erath County
  stephenville: 'Erath', dublin: 'Erath',
  // Johnson County
  cleburne: 'Johnson', burleson_johnson: 'Johnson', joshua: 'Johnson',
  alvarado: 'Johnson', grandview: 'Johnson',
  // Hood County
  granbury: 'Hood', tolar: 'Hood', cresson: 'Hood',
  // Gonzales County
  gonzales: 'Gonzales', nixon: 'Gonzales', waelder: 'Gonzales',

  // ═══ RING 4: ~100-140 mi ═══
  // Bexar County
  san_antonio: 'Bexar', converse: 'Bexar', live_oak_bexar: 'Bexar',
  universal_city: 'Bexar', schertz: 'Bexar', helotes: 'Bexar',
  // Dallas County
  dallas: 'Dallas', garland: 'Dallas', irving: 'Dallas', mesquite: 'Dallas',
  grand_prairie: 'Dallas', richardson: 'Dallas', desoto: 'Dallas', duncanville: 'Dallas',
  // Tarrant County
  fort_worth: 'Tarrant', arlington: 'Tarrant', north_richland_hills: 'Tarrant',
  euless: 'Tarrant', bedford: 'Tarrant', hurst: 'Tarrant', grapevine: 'Tarrant',
  keller: 'Tarrant', mansfield: 'Tarrant', southlake: 'Tarrant',
  // Ellis County
  waxahachie: 'Ellis', midlothian: 'Ellis', ennis: 'Ellis', red_oak: 'Ellis',
  // Kaufman County
  kaufman: 'Kaufman', terrell: 'Kaufman', forney: 'Kaufman',
  // Collin County
  plano: 'Collin', mckinney: 'Collin', frisco: 'Collin',
  allen: 'Collin', wylie: 'Collin', celina: 'Collin', prosper: 'Collin',
  // Denton County
  denton: 'Denton', lewisville: 'Denton', flower_mound: 'Denton',
  little_elm: 'Denton', corinth: 'Denton', argyle: 'Denton',
  // Parker County
  weatherford: 'Parker', aledo: 'Parker', willow_park: 'Parker', hudson_oaks: 'Parker',
  // Palo Pinto County
  mineral_wells: 'Palo Pinto', palo_pinto: 'Palo Pinto', gordon: 'Palo Pinto',
  // Eastland County
  eastland: 'Eastland', cisco: 'Eastland', ranger: 'Eastland', gorman: 'Eastland',
  // Callahan County
  baird: 'Callahan', clyde: 'Callahan', cross_plains: 'Callahan',
  // Coleman County
  coleman: 'Coleman', santa_anna: 'Coleman',
  // Kendall County
  boerne: 'Kendall', comfort: 'Kendall', fair_oaks_ranch: 'Kendall',
  // Kerr County
  kerrville: 'Kerr', ingram: 'Kerr', center_point: 'Kerr', hunt: 'Kerr',
  // Gillespie County
  fredericksburg: 'Gillespie', stonewall_gillespie: 'Gillespie',
  // Kimble County
  junction: 'Kimble', london: 'Kimble',
  // Menard County
  menard: 'Menard',
  // Concho County
  paint_rock: 'Concho', eden: 'Concho',
  // Grimes County
  anderson: 'Grimes', navasota: 'Grimes', todd_mission: 'Grimes',
  // Walker County
  huntsville: 'Walker', riverside: 'Walker', new_waverly: 'Walker',
  // Waller County
  hempstead: 'Waller', waller: 'Waller', prairie_view: 'Waller',
  // Colorado County
  columbus: 'Colorado', eagle_lake: 'Colorado', weimar: 'Colorado',
  // Lavaca County
  hallettsville: 'Lavaca', yoakum: 'Lavaca', shiner: 'Lavaca',
  // DeWitt County
  cuero: 'DeWitt', yorktown: 'DeWitt',
  // Wilson County
  floresville: 'Wilson', la_vernia: 'Wilson', stockdale: 'Wilson',
  // Anderson County
  palestine: 'Anderson', elkhart: 'Anderson', frankston: 'Anderson',
  // Henderson County
  athens: 'Henderson', gun_barrel_city: 'Henderson', mabank: 'Henderson',
  // Rockwall County
  rockwall: 'Rockwall', royse_city: 'Rockwall', heath: 'Rockwall',
  // Runnels County
  ballinger: 'Runnels', winters: 'Runnels',
  // Houston County
  crockett: 'Houston', grapeland: 'Houston',

  // ═══ RING 5: ~140-175 mi ═══
  // Taylor County
  abilene: 'Taylor', merkel: 'Taylor', tuscola: 'Taylor',
  // Stephens County
  breckenridge: 'Stephens',
  // Shackelford County
  albany: 'Shackelford',
  // Jack County
  jacksboro: 'Jack',
  // Wise County
  decatur: 'Wise', bridgeport: 'Wise', alvord: 'Wise', rhome: 'Wise',
  // Grayson County
  sherman: 'Grayson', denison: 'Grayson', whitesboro: 'Grayson', van_alstyne: 'Grayson',
  // Hunt County
  greenville: 'Hunt', commerce: 'Hunt', caddo_mills: 'Hunt',
  // Van Zandt County
  canton: 'Van Zandt', grand_saline: 'Van Zandt', wills_point: 'Van Zandt',
  // Rains County
  emory: 'Rains', point: 'Rains',
  // Smith County
  tyler: 'Smith', whitehouse: 'Smith', lindale: 'Smith', bullard: 'Smith',
  // Cherokee County
  rusk: 'Cherokee', jacksonville: 'Cherokee', alto: 'Cherokee',
  // Montgomery County
  conroe: 'Montgomery', the_woodlands: 'Montgomery', magnolia: 'Montgomery',
  willis: 'Montgomery', new_caney: 'Montgomery', porter: 'Montgomery',
  // Harris County
  houston: 'Harris', pasadena: 'Harris', baytown: 'Harris', katy: 'Harris',
  sugar_land_harris: 'Harris', pearland_harris: 'Harris', spring: 'Harris',
  cypress: 'Harris', humble: 'Harris', tomball: 'Harris',
  // Fort Bend County
  sugar_land: 'Fort Bend', missouri_city: 'Fort Bend', richmond: 'Fort Bend',
  rosenberg: 'Fort Bend', fulshear: 'Fort Bend',
  // Brazoria County
  pearland: 'Brazoria', alvin: 'Brazoria', lake_jackson: 'Brazoria',
  angleton: 'Brazoria', clute: 'Brazoria', manvel: 'Brazoria',
  // Austin County
  bellville: 'Austin', sealy: 'Austin', wallis: 'Austin',
  // Victoria County
  victoria: 'Victoria',
  // Karnes County
  karnes_city: 'Karnes', kenedy: 'Karnes', runge: 'Karnes',
  // Medina County
  hondo: 'Medina', castroville: 'Medina', devine: 'Medina', natalia: 'Medina',
  // Bandera County
  bandera: 'Bandera', pipe_creek: 'Bandera',
  // Atascosa County
  jourdanton: 'Atascosa', pleasanton: 'Atascosa', poteet: 'Atascosa', lytle: 'Atascosa',
  // Goliad County
  goliad: 'Goliad',
  // Jackson County
  edna: 'Jackson', ganado: 'Jackson',
  // San Jacinto County
  coldspring: 'San Jacinto', shepherd: 'San Jacinto',
  // Polk County
  livingston: 'Polk', corrigan: 'Polk', onalaska: 'Polk',
  // Trinity County
  groveton: 'Trinity', trinity: 'Trinity',
  // Tom Green County
  san_angelo: 'Tom Green', wall: 'Tom Green', grape_creek: 'Tom Green',
  // Nolan County
  sweetwater: 'Nolan', roscoe: 'Nolan',
  // Coke County
  robert_lee: 'Coke', bronte: 'Coke',
  // Schleicher County
  eldorado: 'Schleicher',
  // Sutton County
  sonora: 'Sutton',
  // Edwards County
  rocksprings: 'Edwards',
  // Real County
  leakey: 'Real', camp_wood: 'Real',
  // Uvalde County
  uvalde: 'Uvalde', sabinal: 'Uvalde',

  // ═══ RING 6: ~175-200 mi (outer edge) ═══
  // Wichita County
  wichita_falls: 'Wichita', burkburnett: 'Wichita', iowa_park: 'Wichita',
  // Clay County
  henrietta: 'Clay',
  // Archer County
  archer_city: 'Archer', holliday: 'Archer',
  // Baylor County
  seymour: 'Baylor',
  // Throckmorton County
  throckmorton: 'Throckmorton',
  // Jones County
  anson: 'Jones', stamford_jones: 'Jones', hamlin: 'Jones',
  // Haskell County
  haskell: 'Haskell',
  // Knox County
  benjamin: 'Knox', munday: 'Knox',
  // Fisher County
  roby: 'Fisher', rotan: 'Fisher',
  // Stonewall County
  aspermont: 'Stonewall',
  // Irion County
  mertzon: 'Irion',
  // Cooke County
  gainesville: 'Cooke', muenster: 'Cooke', valley_view: 'Cooke',
  // Montague County
  montague: 'Montague', bowie_montague: 'Montague', nocona: 'Montague',
  // Fannin County
  bonham: 'Fannin', leonard: 'Fannin', honey_grove: 'Fannin',
  // Delta County
  cooper: 'Delta',
  // Hopkins County
  sulphur_springs: 'Hopkins', como: 'Hopkins',
  // Wood County
  quitman: 'Wood', mineola: 'Wood', winnsboro: 'Wood',
  // Upshur County
  gilmer: 'Upshur', big_sandy: 'Upshur',
  // Gregg County
  longview: 'Gregg', kilgore: 'Gregg', gladewater: 'Gregg',
  // Rusk County
  henderson: 'Rusk', overton: 'Rusk', tatum: 'Rusk',
  // Nacogdoches County
  nacogdoches: 'Nacogdoches', garrison: 'Nacogdoches',
  // Angelina County
  lufkin: 'Angelina', diboll: 'Angelina', hudson: 'Angelina',
  // Panola County
  carthage: 'Panola',
  // Shelby County
  center: 'Shelby', timpson: 'Shelby',
  // San Augustine County
  san_augustine: 'San Augustine',
  // Galveston County
  galveston: 'Galveston', texas_city: 'Galveston', league_city: 'Galveston',
  dickinson: 'Galveston', friendswood: 'Galveston', santa_fe_galveston: 'Galveston',
  // Chambers County
  anahuac: 'Chambers', winnie: 'Chambers', mont_belvieu: 'Chambers',
  // Liberty County
  liberty: 'Liberty', dayton: 'Liberty', cleveland: 'Liberty',
  // Wharton County
  wharton: 'Wharton', el_campo: 'Wharton', east_bernard: 'Wharton',
  // Matagorda County
  bay_city: 'Matagorda', palacios: 'Matagorda',
  // Calhoun County
  port_lavaca: 'Calhoun', point_comfort: 'Calhoun', seadrift: 'Calhoun',
  // Refugio County
  refugio: 'Refugio', woodsboro: 'Refugio',
  // Bee County
  beeville: 'Bee', pettus: 'Bee',
  // Live Oak County
  george_west: 'Live Oak', three_rivers: 'Live Oak',
  // San Patricio County
  sinton: 'San Patricio', portland: 'San Patricio', ingleside: 'San Patricio',
  aransas_pass: 'San Patricio', taft: 'San Patricio', odem: 'San Patricio',
  // McMullen County
  tilden: 'McMullen',
  // Frio County
  pearsall: 'Frio', dilley: 'Frio',
  // La Salle County
  cotulla: 'La Salle', encinal: 'La Salle',
  // Dimmit County
  carrizo_springs: 'Dimmit', big_wells: 'Dimmit',
  // Young County
  graham: 'Young', olney: 'Young',
  // Nueces County (borderline ~225 mi but commonly searched)
  corpus_christi: 'Nueces', robstown: 'Nueces', port_aransas: 'Nueces',
};

/**
 * Detect county from city name (fuzzy match).
 */
export function detectCountyFromCity(city: string | null): string | null {
  if (!city) return null;
  const normalized = city.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z_]/g, '');
  return CITY_TO_COUNTY[normalized] ?? null;
}

// ── Nominatim Geocoder (Layer 0A) ──────────────────────────────────────────

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    state?: string;
    postcode?: string;
    county?: string;
    country_code?: string;
  };
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number,
  logger: PipelineLogger,
  label: string,
): Promise<Response | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = 2_000 * Math.pow(2, attempt - 1);
        logger.info('Retry', `${label}: retry ${attempt}/${maxRetries} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const response = await fetch(url, options);
      return response;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (attempt === maxRetries) {
        logger.warn('Retry', `${label}: all ${maxRetries + 1} attempts failed: ${errMsg}`);
        return null;
      }
    }
  }
  return null;
}

async function geocodeNominatim(address: string, logger: PipelineLogger): Promise<{
  success: boolean;
  road: string | null;
  houseNumber: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lon: number | null;
}> {
  const tracker = logger.startAttempt({
    layer: 'Stage0A',
    source: 'Nominatim',
    method: 'geocode',
    input: address,
  });

  const fail = { success: false, road: null, houseNumber: null, city: null, county: null, state: null, zip: null, lat: null, lon: null };

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&addressdetails=1&limit=3&countrycodes=us`;
    tracker.step(`GET ${url}`);

    const response = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'StarrResearchPipeline/5.0 (property-research)' },
      signal: AbortSignal.timeout(15_000),
    }, 2, logger, 'Nominatim');

    if (!response || !response.ok) {
      tracker.step(`Nominatim failed: ${response ? `HTTP ${response.status}` : 'no response'}`);
      tracker({ status: 'fail', error: response ? `HTTP ${response.status}` : 'Network error' });
      return fail;
    }

    const results = (await response.json()) as NominatimResult[];
    tracker.step(`Nominatim returned ${results.length} result(s)`);
    if (!results.length) {
      tracker({ status: 'fail', error: 'No results' });
      return fail;
    }

    // Pick best result: prefer one with house_number
    const best = results.find((r) => r.address.house_number) ?? results[0];
    const addr = best.address;
    tracker.step(`Best result: road="${addr.road}", house="${addr.house_number}", city="${addr.city ?? addr.town}", county="${addr.county}"`);

    tracker({
      status: 'success',
      dataPointsFound: results.length,
      details: `Road: ${addr.road ?? 'N/A'}, House: ${addr.house_number ?? 'N/A'}, County: ${addr.county ?? 'N/A'}`,
    });

    return {
      success: true,
      road: addr.road ?? null,
      houseNumber: addr.house_number ?? null,
      city: addr.city ?? addr.town ?? addr.village ?? addr.hamlet ?? null,
      county: addr.county ? addr.county.replace(/\s*County$/i, '').trim() : null,
      state: addr.state ?? null,
      zip: addr.postcode ?? null,
      lat: parseFloat(best.lat),
      lon: parseFloat(best.lon),
    };
  } catch (err) {
    tracker({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
    return fail;
  }
}

// ── US Census Geocoder (Layer 0B) ──────────────────────────────────────────

interface CensusResult {
  result: {
    addressMatches: Array<{
      matchedAddress: string;
      coordinates: { x: number; y: number };
      addressComponents: {
        fromAddress: string;
        toAddress: string;
        preQualifier: string;
        preDirection: string;
        preType: string;
        streetName: string;
        suffixType: string;
        suffixDirection: string;
        suffixQualifier: string;
        city: string;
        state: string;
        zip: string;
      };
    }>;
  };
}

async function geocodeCensus(address: string, logger: PipelineLogger): Promise<{
  success: boolean;
  streetName: string | null;
  preDirection: string | null;
  suffixType: string | null;
  suffixDirection: string | null;
  fromAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lon: number | null;
  matchedAddress: string | null;
}> {
  const censusTracker = logger.startAttempt({
    layer: 'Stage0B',
    source: 'Census',
    method: 'geocode',
    input: address,
  });

  const fail = { success: false, streetName: null, preDirection: null, suffixType: null, suffixDirection: null, fromAddress: null, city: null, state: null, zip: null, lat: null, lon: null, matchedAddress: null };

  try {
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
    censusTracker.step(`GET ${url}`);

    const response = await fetchWithRetry(url, {
      signal: AbortSignal.timeout(20_000),
    }, 2, logger, 'Census');

    if (!response || !response.ok) {
      censusTracker.step(`Census failed: ${response ? `HTTP ${response.status}` : 'no response'}`);
      censusTracker({ status: 'fail', error: response ? `HTTP ${response.status}` : 'Network error' });
      return fail;
    }

    const data = (await response.json()) as CensusResult;
    const matches = data.result?.addressMatches;

    if (!matches?.length) {
      censusTracker.step('Census returned 0 address matches');
      censusTracker({ status: 'fail', error: 'No address matches' });
      return fail;
    }

    const match = matches[0];
    const comp = match.addressComponents;
    censusTracker.step(`Census matched: "${match.matchedAddress}" | street="${comp.streetName}", preDir="${comp.preDirection}", type="${comp.suffixType}", city="${comp.city}"`);

    censusTracker({
      status: 'success',
      dataPointsFound: matches.length,
      details: `Matched: ${match.matchedAddress}, Street: ${comp.streetName}, Type: ${comp.suffixType}`,
    });

    return {
      success: true,
      streetName: comp.streetName || null,
      preDirection: comp.preDirection || null,
      suffixType: comp.suffixType || null,
      suffixDirection: comp.suffixDirection || null,
      fromAddress: comp.fromAddress || null,
      city: comp.city || null,
      state: comp.state || null,
      zip: comp.zip || null,
      lat: match.coordinates.y,
      lon: match.coordinates.x,
      matchedAddress: match.matchedAddress,
    };
  } catch (err) {
    censusTracker({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
    return fail;
  }
}

// ── Road String Parser ─────────────────────────────────────────────────────

/**
 * Convert geocoder road output to CAD-friendly format.
 * "Farm-to-Market Road 436" → "FM 436"
 * "State Highway 195" → "SH 195"
 * "County Road 281" → "CR 281"
 */
export function parseRoadString(road: string): string {
  let result = road.trim();

  // Sort by length (longest first) so "Farm-to-Market Road" matches before "Farm-to-Market"
  const sorted = Object.entries(ROAD_EXPANSIONS)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [longForm, abbrev] of sorted) {
    const re = new RegExp(longForm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (re.test(result)) {
      result = result.replace(re, abbrev);
      break;
    }
  }

  // Clean up double spaces
  return result.replace(/\s+/g, ' ').trim();
}

// ── Manual Address Parser (Layer 0C) ───────────────────────────────────────

/**
 * Regex-based address parser as fallback when geocoding fails.
 * Handles standard US formats and Texas-specific patterns.
 */
export function parseAddressManually(raw: string): ParsedAddress {
  const cleaned = raw.trim().replace(/\s+/g, ' ');

  // Extract unit/suite first
  const unitMatch = cleaned.match(/(?:,?\s*)?(?:Apt\.?|Suite|Ste\.?|Unit|#|Bldg\.?|Building)\s*[#]?\s*(\S+)/i);
  const withoutUnit = unitMatch ? cleaned.replace(unitMatch[0], '').trim() : cleaned;

  // Try full address: NUMBER STREET, CITY, STATE ZIP
  const fullMatch = withoutUnit.match(
    /^(\d+[-\w]*)\s+(.+?)\s*,\s*([^,]+)\s*,\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i,
  );

  if (fullMatch) {
    const [, num, street, city, state, zip] = fullMatch;
    const { name, type, preDir, postDir } = parseStreetParts(street);

    return {
      streetNumber: num,
      streetName: name,
      streetType: type,
      preDirection: preDir,
      postDirection: postDir,
      unit: unitMatch?.[1] ?? null,
      city: city.trim(),
      state: state.toUpperCase(),
      zip: zip ?? null,
    };
  }

  // Try without city/state: NUMBER STREET
  const simpleMatch = withoutUnit.match(/^(\d+[-\w]*)\s+(.+)/);
  if (simpleMatch) {
    const rawStreet = simpleMatch[2].replace(/,.*$/, '').trim();
    const { name, type, preDir, postDir } = parseStreetParts(rawStreet);

    // Try to extract city/state from remainder
    const remainder = simpleMatch[2].includes(',')
      ? simpleMatch[2].substring(simpleMatch[2].indexOf(',') + 1).trim()
      : '';
    const csMatch = remainder.match(/^([^,]+),\s*([A-Z]{2})\s*(\d{5})?$/i);

    return {
      streetNumber: simpleMatch[1],
      streetName: name,
      streetType: type,
      preDirection: preDir,
      postDirection: postDir,
      unit: unitMatch?.[1] ?? null,
      city: csMatch?.[1]?.trim() ?? null,
      state: csMatch?.[2]?.toUpperCase() ?? null,
      zip: csMatch?.[3] ?? null,
    };
  }

  return {
    streetNumber: '',
    streetName: cleaned,
    streetType: '',
    preDirection: null,
    postDirection: null,
    unit: null,
    city: null,
    state: null,
    zip: null,
  };
}

/**
 * Separate a street string into name, type, pre-direction, post-direction.
 */
function parseStreetParts(street: string): {
  name: string;
  type: string;
  preDir: string | null;
  postDir: string | null;
} {
  let remaining = street.trim();
  let preDir: string | null = null;
  let postDir: string | null = null;
  let type = '';

  // Extract pre-directional
  const preDirMatch = remaining.match(DIRECTIONAL_ABBREV_RE);
  if (preDirMatch) {
    preDir = normalizeDirection(preDirMatch[1]);
    remaining = remaining.substring(preDirMatch[0].length).trim();
  }

  // Extract post-directional
  const postDirMatch = remaining.match(DIRECTIONAL_SUFFIX_RE);
  if (postDirMatch) {
    postDir = normalizeDirection(postDirMatch[1]);
    remaining = remaining.substring(0, remaining.length - postDirMatch[0].length).trim();
  }

  // Extract street type from end
  const words = remaining.split(/\s+/);
  if (words.length >= 2) {
    const lastWord = words[words.length - 1];
    for (const [, variants] of Object.entries(STREET_TYPE_MAP)) {
      if (variants.some((v) => v.toLowerCase() === lastWord.toLowerCase())) {
        type = lastWord;
        words.pop();
        break;
      }
    }
  }

  return { name: words.join(' '), type, preDir, postDir };
}

function normalizeDirection(dir: string): string {
  const upper = dir.toUpperCase().replace(/\s+/g, '');
  for (const [abbrev, variants] of Object.entries(DIRECTIONS)) {
    if (variants.some((v) => v.toUpperCase() === upper)) return abbrev;
  }
  return upper;
}

// ── Directional Stripping for FM/SH/CR Roads ──────────────────────────────

/** Texas state road type pattern */
const TX_ROAD_TYPES = /\b(FM|SH|CR|RR|RM|HWY|US|IH|SPUR|LOOP|PR)\b/i;

/**
 * Strip directional prefixes/suffixes from Texas state road names.
 * "W FM 436" → "FM 436", "FM 436 W" → "FM 436"
 */
function stripDirectionalFromRoad(streetName: string): string {
  // Only strip directionals from TX numbered roads
  if (!TX_ROAD_TYPES.test(streetName)) return streetName;

  let result = streetName;

  // Strip leading directional
  result = result.replace(/^(North|South|East|West|NE|NW|SE|SW|N|S|E|W)\s+/i, '');

  // Strip trailing directional
  result = result.replace(/\s+(North|South|East|West|NE|NW|SE|SW|N|S|E|W)$/i, '');

  return result.trim();
}

// ── Variant Generation ─────────────────────────────────────────────────────

/**
 * Generate 15+ search query variants from a normalized address.
 * CAD systems index addresses inconsistently, so we try every plausible format.
 * Includes partial/fuzzy searches as lower-priority fallbacks.
 */
export function generateVariants(
  streetNumber: string,
  streetName: string,
  streetType: string,
  preDirection: string | null,
  postDirection: string | null,
  city: string | null,
): AddressVariant[] {
  const variants: AddressVariant[] = [];
  const seen = new Set<string>();
  let priority = 0;

  function add(num: string, name: string, format: string, partial: boolean = false): void {
    // Normalize for dedup (but keep the original casing in the variant)
    const key = `${num}|${name}`.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return;
    if (!num && !partial) return; // Don't add empty-number exact variants
    seen.add(key);
    priority++;
    variants.push({
      streetNumber: num,
      streetName: name,
      format,
      query: num ? `${num} ${name}` : name,
      priority,
      isPartial: partial,
    });
  }

  const stripped = stripDirectionalFromRoad(streetName);
  const upperStripped = stripped.toUpperCase();

  // ── EXACT VARIANTS (high priority) ───────────────────────────────

  // 1. Geocoded/canonical form (directionals stripped from TX roads)
  add(streetNumber, stripped, 'geocoded-canonical');

  // 2. With street type appended
  if (streetType) {
    add(streetNumber, `${stripped} ${streetType}`, 'with-type');
  }

  // 3. Original with directional prefix (if different)
  if (preDirection && streetName !== stripped) {
    add(streetNumber, `${preDirection} ${stripped}`, 'with-pre-dir');
  }

  // 4. With post-directional
  if (postDirection) {
    add(streetNumber, `${stripped} ${postDirection}`, 'with-post-dir');
  }

  // 5. FM/SH/CR road with "RD" suffix
  const fmMatch = stripped.match(/^(FM|SH|CR|RR|RM)\s+(\d+)$/i);
  if (fmMatch) {
    const roadType = fmMatch[1].toUpperCase();
    const roadNum = fmMatch[2];
    add(streetNumber, `${roadType} ${roadNum}`, 'tx-road-base');
    add(streetNumber, `${roadType} RD ${roadNum}`, 'tx-road-rd-prefix');
    add(streetNumber, `${roadType} ${roadNum} RD`, 'tx-road-rd-suffix');
    add(streetNumber, `${roadType} ROAD ${roadNum}`, 'tx-road-road-prefix');

    // All long-form expansions for this road type
    const expansions = ROAD_SHORT_TO_LONG[roadType] ?? [];
    for (const expansion of expansions) {
      if (expansion !== roadType) {
        add(streetNumber, `${expansion} ${roadNum}`, `tx-road-expanded-${expansion.toLowerCase().replace(/\s+/g, '-')}`);
      }
    }
  }

  // 6. Highway pattern variations: "HWY 195" ↔ "Highway 195" ↔ "US 195"
  const hwyMatch = stripped.match(/^(Highway|Hwy|HWY|US|US Highway)\s+(\d+)$/i);
  if (hwyMatch) {
    const num = hwyMatch[2];
    add(streetNumber, `HWY ${num}`, 'hwy-abbrev');
    add(streetNumber, `Highway ${num}`, 'hwy-full');
    add(streetNumber, `US ${num}`, 'us-abbrev');
    add(streetNumber, `US HWY ${num}`, 'us-hwy');
    add(streetNumber, `US Highway ${num}`, 'us-highway');
  }

  // 7. Street type alternation (Dr ↔ Drive, St ↔ Street, etc.)
  if (streetType) {
    for (const [, alts] of Object.entries(STREET_TYPE_MAP)) {
      if (alts.some((a) => a.toLowerCase() === streetType.toLowerCase())) {
        for (const alt of alts) {
          if (alt.toLowerCase() !== streetType.toLowerCase()) {
            add(streetNumber, `${stripped} ${alt}`, `type-alt-${alt.toLowerCase()}`);
          }
        }
        break;
      }
    }
  }

  // 8. Without street type entirely
  if (streetType) {
    add(streetNumber, stripped, 'no-type');
  }

  // 9. ALL CAPS variant (some CAD systems require uppercase)
  if (upperStripped !== stripped) {
    add(streetNumber, upperStripped, 'uppercase');
    if (streetType) {
      add(streetNumber, `${upperStripped} ${streetType.toUpperCase()}`, 'uppercase-with-type');
    }
  }

  // 10. No periods (some addresses have "St." or "Dr.")
  const noPeriods = stripped.replace(/\./g, '');
  if (noPeriods !== stripped) {
    add(streetNumber, noPeriods, 'no-periods');
  }

  // 11. Ordinal expansion: "5th St" → "Fifth St", "Fifth St" → "5th St"
  const words = stripped.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const lower = words[i].toLowerCase();
    if (ORDINALS[lower]) {
      const expanded = [...words];
      expanded[i] = ORDINALS[lower];
      add(streetNumber, expanded.join(' '), 'ordinal-to-digit');
      if (streetType) add(streetNumber, `${expanded.join(' ')} ${streetType}`, 'ordinal-to-digit-typed');
    }
    if (ORDINALS_REVERSE[lower]) {
      const expanded = [...words];
      expanded[i] = ORDINALS_REVERSE[lower];
      add(streetNumber, expanded.join(' '), 'digit-to-ordinal');
      if (streetType) add(streetNumber, `${expanded.join(' ')} ${streetType}`, 'digit-to-ordinal-typed');
    }
  }

  // 12. Without directional for non-TX-roads too
  if (preDirection) {
    add(streetNumber, stripped, 'no-pre-dir');
    if (streetType) add(streetNumber, `${stripped} ${streetType}`, 'no-pre-dir-typed');
  }

  // 13. Common misspelling: double space, hyphenation
  const dehyphenated = stripped.replace(/-/g, ' ');
  if (dehyphenated !== stripped) {
    add(streetNumber, dehyphenated, 'dehyphenated');
  }
  const hyphenated = stripped.replace(/\s+/g, '-');
  if (hyphenated !== stripped) {
    add(streetNumber, hyphenated, 'hyphenated');
  }

  // ── PARTIAL / FUZZY SEARCHES (lower priority) ────────────────────

  // 14. Street name only (no number) — catches nearby addresses
  add('', stripped, 'partial-name-only', true);
  if (streetType) {
    add('', `${stripped} ${streetType}`, 'partial-name-typed', true);
  }

  // 15. Number range: try ±10 from the original number
  const numInt = parseInt(streetNumber, 10);
  if (!isNaN(numInt) && streetNumber.match(/^\d+$/)) {
    // Try adjacent even/odd numbers
    for (const offset of [2, -2, 4, -4]) {
      const adjacent = numInt + offset;
      if (adjacent > 0) {
        add(String(adjacent), stripped, `partial-adjacent-${offset > 0 ? '+' : ''}${offset}`, true);
      }
    }
  }

  // 16. Just the house number (for rare CAD systems that search by number first)
  if (streetNumber) {
    add(streetNumber, '', 'partial-number-only', true);
  }

  return variants;
}

// ── Main Normalize Function ────────────────────────────────────────────────

/**
 * Normalize an address through Nominatim → Census → manual parse,
 * then generate 15+ search variants for CAD queries.
 * Also detects county from geocoding when possible.
 */
export async function normalizeAddress(
  rawAddress: string,
  logger: PipelineLogger,
): Promise<NormalizedAddress> {
  logger.info('Stage0', `Normalizing address: ${rawAddress}`);

  let lat: number | null = null;
  let lon: number | null = null;
  let detectedCounty: string | null = null;

  // Layer 0A: Nominatim
  const nom = await geocodeNominatim(rawAddress, logger);
  if (nom.success && nom.road && nom.houseNumber) {
    const parsedRoad = parseRoadString(nom.road);
    const { name, type, preDir, postDir } = parseStreetParts(parsedRoad);

    const parsed: ParsedAddress = {
      streetNumber: nom.houseNumber,
      streetName: name,
      streetType: type,
      preDirection: preDir,
      postDirection: postDir,
      unit: null,
      city: nom.city,
      state: nom.state,
      zip: nom.zip,
    };

    lat = nom.lat;
    lon = nom.lon;
    detectedCounty = nom.county ?? detectCountyFromCity(nom.city);

    const variants = generateVariants(parsed.streetNumber, parsed.streetName, parsed.streetType, preDir, postDir, parsed.city);

    return {
      raw: rawAddress,
      canonical: `${parsed.streetNumber} ${parsed.streetName}${parsed.streetType ? ' ' + parsed.streetType : ''}`,
      parsed,
      geocoded: true,
      source: 'nominatim',
      variants,
      lat,
      lon,
      detectedCounty,
    };
  }

  // Layer 0B: Census Geocoder
  const census = await geocodeCensus(rawAddress, logger);
  if (census.success && census.streetName && census.fromAddress) {
    const parsedRoad = parseRoadString(census.streetName);

    const parsed: ParsedAddress = {
      streetNumber: census.fromAddress,
      streetName: parsedRoad,
      streetType: census.suffixType ?? '',
      preDirection: census.preDirection || null,
      postDirection: census.suffixDirection || null,
      unit: null,
      city: census.city,
      state: census.state,
      zip: census.zip,
    };

    lat = census.lat;
    lon = census.lon;
    detectedCounty = detectCountyFromCity(census.city);

    const variants = generateVariants(parsed.streetNumber, parsed.streetName, parsed.streetType, parsed.preDirection, parsed.postDirection, parsed.city);

    return {
      raw: rawAddress,
      canonical: census.matchedAddress ?? `${parsed.streetNumber} ${parsed.streetName}`,
      parsed,
      geocoded: true,
      source: 'census',
      variants,
      lat,
      lon,
      detectedCounty,
    };
  }

  // Layer 0C: Manual parse
  logger.info('Stage0C', 'Falling back to manual address parsing');
  const parsed = parseAddressManually(rawAddress);
  detectedCounty = detectCountyFromCity(parsed.city);

  const variants = generateVariants(parsed.streetNumber, parsed.streetName, parsed.streetType, parsed.preDirection, parsed.postDirection, parsed.city);

  return {
    raw: rawAddress,
    canonical: `${parsed.streetNumber} ${parsed.streetName}${parsed.streetType ? ' ' + parsed.streetType : ''}`,
    parsed,
    geocoded: false,
    source: 'manual',
    variants,
    lat: null,
    lon: null,
    detectedCounty,
  };
}
