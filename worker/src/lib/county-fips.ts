// worker/src/lib/county-fips.ts
// All 254 Texas counties with FIPS codes and CAD system assignments.
//
// FIPS format: state "48" + 3-digit county code, zero-padded (e.g. "48027" = Bell).
// CAD system derived from:
//   - BIS_CONFIGS keys in bell-cad.ts           → 'bis_consultants'
//   - TRUEAUTO_BY_COUNTY keys that are NOT in BIS → 'trueautomation'
//   - Harris County                               → 'hcad'
//   - Tarrant County                              → 'tad'
//   - Everything else                             → 'texasfile_fallback'

import type { CadSystemName } from '../types/property-discovery.js';

export interface CountyRecord {
  /** Full county name (Title Case) */
  name: string;
  /** 5-digit FIPS code */
  fips: string;
  /** Lookup key used in BIS_CONFIGS / TRUEAUTO_BY_COUNTY (lowercase, underscores) */
  key: string;
  /** Primary CAD vendor for this county */
  cadSystem: CadSystemName;
}

/** All 254 Texas counties ordered by FIPS code */
export const TEXAS_COUNTIES: CountyRecord[] = [
  { name: 'Anderson',   fips: '48001', key: 'anderson',   cadSystem: 'bis_consultants' },
  { name: 'Andrews',    fips: '48003', key: 'andrews',    cadSystem: 'texasfile_fallback' },
  { name: 'Angelina',   fips: '48005', key: 'angelina',   cadSystem: 'bis_consultants' },
  { name: 'Aransas',    fips: '48007', key: 'aransas',    cadSystem: 'texasfile_fallback' },
  { name: 'Archer',     fips: '48009', key: 'archer',     cadSystem: 'texasfile_fallback' },
  { name: 'Armstrong',  fips: '48011', key: 'armstrong',  cadSystem: 'texasfile_fallback' },
  { name: 'Atascosa',   fips: '48013', key: 'atascosa',   cadSystem: 'bis_consultants' },
  { name: 'Austin',     fips: '48015', key: 'austin',     cadSystem: 'bis_consultants' },
  { name: 'Bailey',     fips: '48017', key: 'bailey',     cadSystem: 'texasfile_fallback' },
  { name: 'Bandera',    fips: '48019', key: 'bandera',    cadSystem: 'bis_consultants' },
  { name: 'Bastrop',    fips: '48021', key: 'bastrop',    cadSystem: 'bis_consultants' },
  { name: 'Baylor',     fips: '48023', key: 'baylor',     cadSystem: 'texasfile_fallback' },
  { name: 'Bee',        fips: '48025', key: 'bee',        cadSystem: 'texasfile_fallback' },
  { name: 'Bell',       fips: '48027', key: 'bell',       cadSystem: 'bis_consultants' },
  { name: 'Bexar',      fips: '48029', key: 'bexar',      cadSystem: 'bis_consultants' },
  { name: 'Blanco',     fips: '48031', key: 'blanco',     cadSystem: 'bis_consultants' },
  { name: 'Borden',     fips: '48033', key: 'borden',     cadSystem: 'texasfile_fallback' },
  { name: 'Bosque',     fips: '48035', key: 'bosque',     cadSystem: 'bis_consultants' },
  { name: 'Bowie',      fips: '48037', key: 'bowie',      cadSystem: 'texasfile_fallback' },
  { name: 'Brazoria',   fips: '48039', key: 'brazoria',   cadSystem: 'bis_consultants' },
  { name: 'Brazos',     fips: '48041', key: 'brazos',     cadSystem: 'bis_consultants' },
  { name: 'Brewster',   fips: '48043', key: 'brewster',   cadSystem: 'texasfile_fallback' },
  { name: 'Briscoe',    fips: '48045', key: 'briscoe',    cadSystem: 'texasfile_fallback' },
  { name: 'Brooks',     fips: '48047', key: 'brooks',     cadSystem: 'texasfile_fallback' },
  { name: 'Brown',      fips: '48049', key: 'brown',      cadSystem: 'bis_consultants' },
  { name: 'Burleson',   fips: '48051', key: 'burleson',   cadSystem: 'bis_consultants' },
  { name: 'Burnet',     fips: '48053', key: 'burnet',     cadSystem: 'bis_consultants' },
  { name: 'Caldwell',   fips: '48055', key: 'caldwell',   cadSystem: 'bis_consultants' },
  { name: 'Calhoun',    fips: '48057', key: 'calhoun',    cadSystem: 'bis_consultants' },
  { name: 'Callahan',   fips: '48059', key: 'callahan',   cadSystem: 'bis_consultants' },
  { name: 'Cameron',    fips: '48061', key: 'cameron',    cadSystem: 'texasfile_fallback' },
  { name: 'Camp',       fips: '48063', key: 'camp',       cadSystem: 'texasfile_fallback' },
  { name: 'Carson',     fips: '48065', key: 'carson',     cadSystem: 'texasfile_fallback' },
  { name: 'Cass',       fips: '48067', key: 'cass',       cadSystem: 'texasfile_fallback' },
  { name: 'Castro',     fips: '48069', key: 'castro',     cadSystem: 'texasfile_fallback' },
  { name: 'Chambers',   fips: '48071', key: 'chambers',   cadSystem: 'texasfile_fallback' },
  { name: 'Cherokee',   fips: '48073', key: 'cherokee',   cadSystem: 'bis_consultants' },
  { name: 'Childress',  fips: '48075', key: 'childress',  cadSystem: 'texasfile_fallback' },
  { name: 'Clay',       fips: '48077', key: 'clay',       cadSystem: 'texasfile_fallback' },
  { name: 'Cochran',    fips: '48079', key: 'cochran',    cadSystem: 'texasfile_fallback' },
  { name: 'Coke',       fips: '48081', key: 'coke',       cadSystem: 'bis_consultants' },
  { name: 'Coleman',    fips: '48083', key: 'coleman',    cadSystem: 'bis_consultants' },
  { name: 'Collin',     fips: '48085', key: 'collin',     cadSystem: 'bis_consultants' },
  { name: 'Collingsworth', fips: '48087', key: 'collingsworth', cadSystem: 'texasfile_fallback' },
  { name: 'Colorado',   fips: '48089', key: 'colorado',   cadSystem: 'bis_consultants' },
  { name: 'Comal',      fips: '48091', key: 'comal',      cadSystem: 'bis_consultants' },
  { name: 'Comanche',   fips: '48093', key: 'comanche',   cadSystem: 'bis_consultants' },
  { name: 'Concho',     fips: '48095', key: 'concho',     cadSystem: 'bis_consultants' },
  { name: 'Cooke',      fips: '48097', key: 'cooke',      cadSystem: 'texasfile_fallback' },
  { name: 'Coryell',    fips: '48099', key: 'coryell',    cadSystem: 'bis_consultants' },
  { name: 'Cottle',     fips: '48101', key: 'cottle',     cadSystem: 'texasfile_fallback' },
  { name: 'Crane',      fips: '48103', key: 'crane',      cadSystem: 'texasfile_fallback' },
  { name: 'Crockett',   fips: '48105', key: 'crockett',   cadSystem: 'texasfile_fallback' },
  { name: 'Crosby',     fips: '48107', key: 'crosby',     cadSystem: 'texasfile_fallback' },
  { name: 'Culberson',  fips: '48109', key: 'culberson',  cadSystem: 'texasfile_fallback' },
  { name: 'Dallam',     fips: '48111', key: 'dallam',     cadSystem: 'texasfile_fallback' },
  { name: 'Dallas',     fips: '48113', key: 'dallas',     cadSystem: 'trueautomation' },
  { name: 'Dawson',     fips: '48115', key: 'dawson',     cadSystem: 'texasfile_fallback' },
  { name: 'Deaf Smith', fips: '48117', key: 'deaf_smith', cadSystem: 'texasfile_fallback' },
  { name: 'Delta',      fips: '48119', key: 'delta',      cadSystem: 'texasfile_fallback' },
  { name: 'Denton',     fips: '48121', key: 'denton',     cadSystem: 'trueautomation' },
  { name: 'DeWitt',     fips: '48123', key: 'dewitt',     cadSystem: 'bis_consultants' },
  { name: 'Dickens',    fips: '48125', key: 'dickens',    cadSystem: 'texasfile_fallback' },
  { name: 'Dimmit',     fips: '48127', key: 'dimmit',     cadSystem: 'texasfile_fallback' },
  { name: 'Donley',     fips: '48129', key: 'donley',     cadSystem: 'texasfile_fallback' },
  { name: 'Duval',      fips: '48131', key: 'duval',      cadSystem: 'texasfile_fallback' },
  { name: 'Eastland',   fips: '48133', key: 'eastland',   cadSystem: 'bis_consultants' },
  { name: 'Ector',      fips: '48135', key: 'ector',      cadSystem: 'texasfile_fallback' },
  { name: 'Edwards',    fips: '48137', key: 'edwards',    cadSystem: 'bis_consultants' },
  { name: 'Ellis',      fips: '48139', key: 'ellis',      cadSystem: 'bis_consultants' },
  { name: 'El Paso',    fips: '48141', key: 'el_paso',    cadSystem: 'texasfile_fallback' },
  { name: 'Erath',      fips: '48143', key: 'erath',      cadSystem: 'bis_consultants' },
  { name: 'Falls',      fips: '48145', key: 'falls',      cadSystem: 'bis_consultants' },
  { name: 'Fannin',     fips: '48147', key: 'fannin',     cadSystem: 'texasfile_fallback' },
  { name: 'Fayette',    fips: '48149', key: 'fayette',    cadSystem: 'bis_consultants' },
  { name: 'Fisher',     fips: '48151', key: 'fisher',     cadSystem: 'texasfile_fallback' },
  { name: 'Floyd',      fips: '48153', key: 'floyd',      cadSystem: 'texasfile_fallback' },
  { name: 'Foard',      fips: '48155', key: 'foard',      cadSystem: 'texasfile_fallback' },
  { name: 'Fort Bend',  fips: '48157', key: 'fort_bend',  cadSystem: 'bis_consultants' },
  { name: 'Franklin',   fips: '48159', key: 'franklin',   cadSystem: 'texasfile_fallback' },
  { name: 'Freestone',  fips: '48161', key: 'freestone',  cadSystem: 'bis_consultants' },
  { name: 'Frio',       fips: '48163', key: 'frio',       cadSystem: 'texasfile_fallback' },
  { name: 'Gaines',     fips: '48165', key: 'gaines',     cadSystem: 'texasfile_fallback' },
  { name: 'Galveston',  fips: '48167', key: 'galveston',  cadSystem: 'bis_consultants' },
  { name: 'Garza',      fips: '48169', key: 'garza',      cadSystem: 'texasfile_fallback' },
  { name: 'Gillespie',  fips: '48171', key: 'gillespie',  cadSystem: 'bis_consultants' },
  { name: 'Glasscock',  fips: '48173', key: 'glasscock',  cadSystem: 'texasfile_fallback' },
  { name: 'Goliad',     fips: '48175', key: 'goliad',     cadSystem: 'bis_consultants' },
  { name: 'Gonzales',   fips: '48177', key: 'gonzales',   cadSystem: 'bis_consultants' },
  { name: 'Gray',       fips: '48179', key: 'gray',       cadSystem: 'texasfile_fallback' },
  { name: 'Grayson',    fips: '48181', key: 'grayson',    cadSystem: 'bis_consultants' },
  { name: 'Gregg',      fips: '48183', key: 'gregg',      cadSystem: 'texasfile_fallback' },
  { name: 'Grimes',     fips: '48185', key: 'grimes',     cadSystem: 'bis_consultants' },
  { name: 'Guadalupe',  fips: '48187', key: 'guadalupe',  cadSystem: 'bis_consultants' },
  { name: 'Hale',       fips: '48189', key: 'hale',       cadSystem: 'texasfile_fallback' },
  { name: 'Hall',       fips: '48191', key: 'hall',       cadSystem: 'texasfile_fallback' },
  { name: 'Hamilton',   fips: '48193', key: 'hamilton',   cadSystem: 'bis_consultants' },
  { name: 'Hansford',   fips: '48195', key: 'hansford',   cadSystem: 'texasfile_fallback' },
  { name: 'Hardeman',   fips: '48197', key: 'hardeman',   cadSystem: 'texasfile_fallback' },
  { name: 'Hardin',     fips: '48199', key: 'hardin',     cadSystem: 'texasfile_fallback' },
  { name: 'Harris',     fips: '48201', key: 'harris',     cadSystem: 'hcad' },
  { name: 'Harrison',   fips: '48203', key: 'harrison',   cadSystem: 'texasfile_fallback' },
  { name: 'Hartley',    fips: '48205', key: 'hartley',    cadSystem: 'texasfile_fallback' },
  { name: 'Haskell',    fips: '48207', key: 'haskell',    cadSystem: 'texasfile_fallback' },
  { name: 'Hays',       fips: '48209', key: 'hays',       cadSystem: 'bis_consultants' },
  { name: 'Hemphill',   fips: '48211', key: 'hemphill',   cadSystem: 'texasfile_fallback' },
  { name: 'Henderson',  fips: '48213', key: 'henderson',  cadSystem: 'bis_consultants' },
  { name: 'Hidalgo',    fips: '48215', key: 'hidalgo',    cadSystem: 'texasfile_fallback' },
  { name: 'Hill',       fips: '48217', key: 'hill',       cadSystem: 'bis_consultants' },
  { name: 'Hockley',    fips: '48219', key: 'hockley',    cadSystem: 'texasfile_fallback' },
  { name: 'Hood',       fips: '48221', key: 'hood',       cadSystem: 'bis_consultants' },
  { name: 'Hopkins',    fips: '48223', key: 'hopkins',    cadSystem: 'texasfile_fallback' },
  { name: 'Houston',    fips: '48225', key: 'houston',    cadSystem: 'bis_consultants' },
  { name: 'Howard',     fips: '48227', key: 'howard',     cadSystem: 'texasfile_fallback' },
  { name: 'Hudspeth',   fips: '48229', key: 'hudspeth',   cadSystem: 'texasfile_fallback' },
  { name: 'Hunt',       fips: '48231', key: 'hunt',       cadSystem: 'bis_consultants' },
  { name: 'Hutchinson', fips: '48233', key: 'hutchinson', cadSystem: 'texasfile_fallback' },
  { name: 'Irion',      fips: '48235', key: 'irion',      cadSystem: 'texasfile_fallback' },
  { name: 'Jack',       fips: '48237', key: 'jack',       cadSystem: 'bis_consultants' },
  { name: 'Jackson',    fips: '48239', key: 'jackson',    cadSystem: 'bis_consultants' },
  { name: 'Jasper',     fips: '48241', key: 'jasper',     cadSystem: 'texasfile_fallback' },
  { name: 'Jeff Davis', fips: '48243', key: 'jeff_davis', cadSystem: 'texasfile_fallback' },
  { name: 'Jefferson',  fips: '48245', key: 'jefferson',  cadSystem: 'texasfile_fallback' },
  { name: 'Jim Hogg',   fips: '48247', key: 'jim_hogg',   cadSystem: 'texasfile_fallback' },
  { name: 'Jim Wells',  fips: '48249', key: 'jim_wells',  cadSystem: 'texasfile_fallback' },
  { name: 'Johnson',    fips: '48251', key: 'johnson',    cadSystem: 'bis_consultants' },
  { name: 'Jones',      fips: '48253', key: 'jones',      cadSystem: 'bis_consultants' },
  { name: 'Karnes',     fips: '48255', key: 'karnes',     cadSystem: 'bis_consultants' },
  { name: 'Kaufman',    fips: '48257', key: 'kaufman',    cadSystem: 'bis_consultants' },
  { name: 'Kendall',    fips: '48259', key: 'kendall',    cadSystem: 'bis_consultants' },
  { name: 'Kenedy',     fips: '48261', key: 'kenedy',     cadSystem: 'texasfile_fallback' },
  { name: 'Kent',       fips: '48263', key: 'kent',       cadSystem: 'texasfile_fallback' },
  { name: 'Kerr',       fips: '48265', key: 'kerr',       cadSystem: 'bis_consultants' },
  { name: 'Kimble',     fips: '48267', key: 'kimble',     cadSystem: 'bis_consultants' },
  { name: 'King',       fips: '48269', key: 'king',       cadSystem: 'texasfile_fallback' },
  { name: 'Kinney',     fips: '48271', key: 'kinney',     cadSystem: 'texasfile_fallback' },
  { name: 'Kleberg',    fips: '48273', key: 'kleberg',    cadSystem: 'texasfile_fallback' },
  { name: 'Knox',       fips: '48275', key: 'knox',       cadSystem: 'texasfile_fallback' },
  { name: 'Lamar',      fips: '48277', key: 'lamar',      cadSystem: 'texasfile_fallback' },
  { name: 'Lamb',       fips: '48279', key: 'lamb',       cadSystem: 'texasfile_fallback' },
  { name: 'Lampasas',   fips: '48281', key: 'lampasas',   cadSystem: 'bis_consultants' },
  { name: 'La Salle',   fips: '48283', key: 'la_salle',   cadSystem: 'texasfile_fallback' },
  { name: 'Lavaca',     fips: '48285', key: 'lavaca',     cadSystem: 'bis_consultants' },
  { name: 'Lee',        fips: '48287', key: 'lee',        cadSystem: 'bis_consultants' },
  { name: 'Leon',       fips: '48289', key: 'leon',       cadSystem: 'bis_consultants' },
  { name: 'Liberty',    fips: '48291', key: 'liberty',    cadSystem: 'bis_consultants' },
  { name: 'Limestone',  fips: '48293', key: 'limestone',  cadSystem: 'bis_consultants' },
  { name: 'Lipscomb',   fips: '48295', key: 'lipscomb',   cadSystem: 'texasfile_fallback' },
  { name: 'Live Oak',   fips: '48297', key: 'live_oak',   cadSystem: 'texasfile_fallback' },
  { name: 'Llano',      fips: '48299', key: 'llano',      cadSystem: 'bis_consultants' },
  { name: 'Loving',     fips: '48301', key: 'loving',     cadSystem: 'texasfile_fallback' },
  { name: 'Lubbock',    fips: '48303', key: 'lubbock',    cadSystem: 'texasfile_fallback' },
  { name: 'Lynn',       fips: '48305', key: 'lynn',       cadSystem: 'texasfile_fallback' },
  { name: 'McCulloch',  fips: '48307', key: 'mcculloch',  cadSystem: 'bis_consultants' },
  { name: 'McLennan',   fips: '48309', key: 'mclennan',   cadSystem: 'bis_consultants' },
  { name: 'McMullen',   fips: '48311', key: 'mcmullen',   cadSystem: 'texasfile_fallback' },
  { name: 'Madison',    fips: '48313', key: 'madison',    cadSystem: 'bis_consultants' },
  { name: 'Marion',     fips: '48315', key: 'marion',     cadSystem: 'texasfile_fallback' },
  { name: 'Martin',     fips: '48317', key: 'martin',     cadSystem: 'texasfile_fallback' },
  { name: 'Mason',      fips: '48319', key: 'mason',      cadSystem: 'bis_consultants' },
  { name: 'Matagorda',  fips: '48321', key: 'matagorda',  cadSystem: 'bis_consultants' },
  { name: 'Maverick',   fips: '48323', key: 'maverick',   cadSystem: 'texasfile_fallback' },
  { name: 'Medina',     fips: '48325', key: 'medina',     cadSystem: 'bis_consultants' },
  { name: 'Menard',     fips: '48327', key: 'menard',     cadSystem: 'bis_consultants' },
  { name: 'Midland',    fips: '48329', key: 'midland',    cadSystem: 'texasfile_fallback' },
  { name: 'Milam',      fips: '48331', key: 'milam',      cadSystem: 'bis_consultants' },
  { name: 'Mills',      fips: '48333', key: 'mills',      cadSystem: 'bis_consultants' },
  { name: 'Mitchell',   fips: '48335', key: 'mitchell',   cadSystem: 'texasfile_fallback' },
  { name: 'Montague',   fips: '48337', key: 'montague',   cadSystem: 'texasfile_fallback' },
  { name: 'Montgomery', fips: '48339', key: 'montgomery', cadSystem: 'bis_consultants' },
  { name: 'Moore',      fips: '48341', key: 'moore',      cadSystem: 'texasfile_fallback' },
  { name: 'Morris',     fips: '48343', key: 'morris',     cadSystem: 'texasfile_fallback' },
  { name: 'Motley',     fips: '48345', key: 'motley',     cadSystem: 'texasfile_fallback' },
  { name: 'Nacogdoches',fips: '48347', key: 'nacogdoches',cadSystem: 'bis_consultants' },
  { name: 'Navarro',    fips: '48349', key: 'navarro',    cadSystem: 'bis_consultants' },
  { name: 'Newton',     fips: '48351', key: 'newton',     cadSystem: 'texasfile_fallback' },
  { name: 'Nolan',      fips: '48353', key: 'nolan',      cadSystem: 'bis_consultants' },
  { name: 'Nueces',     fips: '48355', key: 'nueces',     cadSystem: 'texasfile_fallback' },
  { name: 'Ochiltree',  fips: '48357', key: 'ochiltree',  cadSystem: 'texasfile_fallback' },
  { name: 'Oldham',     fips: '48359', key: 'oldham',     cadSystem: 'texasfile_fallback' },
  { name: 'Orange',     fips: '48361', key: 'orange',     cadSystem: 'texasfile_fallback' },
  { name: 'Palo Pinto', fips: '48363', key: 'palo_pinto', cadSystem: 'bis_consultants' },
  { name: 'Panola',     fips: '48365', key: 'panola',     cadSystem: 'texasfile_fallback' },
  { name: 'Parker',     fips: '48367', key: 'parker',     cadSystem: 'bis_consultants' },
  { name: 'Parmer',     fips: '48369', key: 'parmer',     cadSystem: 'texasfile_fallback' },
  { name: 'Pecos',      fips: '48371', key: 'pecos',      cadSystem: 'texasfile_fallback' },
  { name: 'Polk',       fips: '48373', key: 'polk',       cadSystem: 'texasfile_fallback' },
  { name: 'Potter',     fips: '48375', key: 'potter',     cadSystem: 'texasfile_fallback' },
  { name: 'Presidio',   fips: '48377', key: 'presidio',   cadSystem: 'texasfile_fallback' },
  { name: 'Rains',      fips: '48379', key: 'rains',      cadSystem: 'texasfile_fallback' },
  { name: 'Randall',    fips: '48381', key: 'randall',    cadSystem: 'texasfile_fallback' },
  { name: 'Reagan',     fips: '48383', key: 'reagan',     cadSystem: 'texasfile_fallback' },
  { name: 'Real',       fips: '48385', key: 'real',       cadSystem: 'bis_consultants' },
  { name: 'Red River',  fips: '48387', key: 'red_river',  cadSystem: 'texasfile_fallback' },
  { name: 'Reeves',     fips: '48389', key: 'reeves',     cadSystem: 'texasfile_fallback' },
  { name: 'Refugio',    fips: '48391', key: 'refugio',    cadSystem: 'texasfile_fallback' },
  { name: 'Roberts',    fips: '48393', key: 'roberts',    cadSystem: 'texasfile_fallback' },
  { name: 'Robertson',  fips: '48395', key: 'robertson',  cadSystem: 'bis_consultants' },
  { name: 'Rockwall',   fips: '48397', key: 'rockwall',   cadSystem: 'texasfile_fallback' },
  { name: 'Runnels',    fips: '48399', key: 'runnels',    cadSystem: 'bis_consultants' },
  { name: 'Rusk',       fips: '48401', key: 'rusk',       cadSystem: 'texasfile_fallback' },
  { name: 'Sabine',     fips: '48403', key: 'sabine',     cadSystem: 'texasfile_fallback' },
  { name: 'San Augustine', fips: '48405', key: 'san_augustine', cadSystem: 'texasfile_fallback' },
  { name: 'San Jacinto',fips: '48407', key: 'san_jacinto',cadSystem: 'bis_consultants' },
  { name: 'San Patricio',fips: '48409', key: 'san_patricio', cadSystem: 'texasfile_fallback' },
  { name: 'San Saba',   fips: '48411', key: 'san_saba',   cadSystem: 'bis_consultants' },
  { name: 'Schleicher', fips: '48413', key: 'schleicher', cadSystem: 'texasfile_fallback' },
  { name: 'Scurry',     fips: '48415', key: 'scurry',     cadSystem: 'texasfile_fallback' },
  { name: 'Shackelford',fips: '48417', key: 'shackelford',cadSystem: 'bis_consultants' },
  { name: 'Shelby',     fips: '48419', key: 'shelby',     cadSystem: 'texasfile_fallback' },
  { name: 'Sherman',    fips: '48421', key: 'sherman',    cadSystem: 'texasfile_fallback' },
  { name: 'Smith',      fips: '48423', key: 'smith',      cadSystem: 'bis_consultants' },
  { name: 'Somervell',  fips: '48425', key: 'somervell',  cadSystem: 'bis_consultants' },
  { name: 'Starr',      fips: '48427', key: 'starr',      cadSystem: 'texasfile_fallback' },
  { name: 'Stephens',   fips: '48429', key: 'stephens',   cadSystem: 'bis_consultants' },
  { name: 'Sterling',   fips: '48431', key: 'sterling',   cadSystem: 'texasfile_fallback' },
  { name: 'Stonewall',  fips: '48433', key: 'stonewall',  cadSystem: 'texasfile_fallback' },
  { name: 'Sutton',     fips: '48435', key: 'sutton',     cadSystem: 'texasfile_fallback' },
  { name: 'Swisher',    fips: '48437', key: 'swisher',    cadSystem: 'texasfile_fallback' },
  { name: 'Tarrant',    fips: '48439', key: 'tarrant',    cadSystem: 'tad' },
  { name: 'Taylor',     fips: '48441', key: 'taylor',     cadSystem: 'bis_consultants' },
  { name: 'Terrell',    fips: '48443', key: 'terrell',    cadSystem: 'texasfile_fallback' },
  { name: 'Terry',      fips: '48445', key: 'terry',      cadSystem: 'texasfile_fallback' },
  { name: 'Throckmorton', fips: '48447', key: 'throckmorton', cadSystem: 'texasfile_fallback' },
  { name: 'Titus',      fips: '48449', key: 'titus',      cadSystem: 'texasfile_fallback' },
  { name: 'Tom Green',  fips: '48451', key: 'tom_green',  cadSystem: 'bis_consultants' },
  { name: 'Travis',     fips: '48453', key: 'travis',     cadSystem: 'trueautomation' },
  { name: 'Trinity',    fips: '48455', key: 'trinity',    cadSystem: 'bis_consultants' },
  { name: 'Tyler',      fips: '48457', key: 'tyler',      cadSystem: 'texasfile_fallback' },
  { name: 'Upshur',     fips: '48459', key: 'upshur',     cadSystem: 'texasfile_fallback' },
  { name: 'Upton',      fips: '48461', key: 'upton',      cadSystem: 'texasfile_fallback' },
  { name: 'Uvalde',     fips: '48463', key: 'uvalde',     cadSystem: 'bis_consultants' },
  { name: 'Val Verde',  fips: '48465', key: 'val_verde',  cadSystem: 'texasfile_fallback' },
  { name: 'Van Zandt',  fips: '48467', key: 'van_zandt',  cadSystem: 'bis_consultants' },
  { name: 'Victoria',   fips: '48469', key: 'victoria',   cadSystem: 'bis_consultants' },
  { name: 'Walker',     fips: '48471', key: 'walker',     cadSystem: 'bis_consultants' },
  { name: 'Waller',     fips: '48473', key: 'waller',     cadSystem: 'bis_consultants' },
  { name: 'Ward',       fips: '48475', key: 'ward',       cadSystem: 'texasfile_fallback' },
  { name: 'Washington', fips: '48477', key: 'washington', cadSystem: 'bis_consultants' },
  { name: 'Webb',       fips: '48479', key: 'webb',       cadSystem: 'texasfile_fallback' },
  { name: 'Wharton',    fips: '48481', key: 'wharton',    cadSystem: 'bis_consultants' },
  { name: 'Wheeler',    fips: '48483', key: 'wheeler',    cadSystem: 'texasfile_fallback' },
  { name: 'Wichita',    fips: '48485', key: 'wichita',    cadSystem: 'texasfile_fallback' },
  { name: 'Wilbarger',  fips: '48487', key: 'wilbarger',  cadSystem: 'texasfile_fallback' },
  { name: 'Willacy',    fips: '48489', key: 'willacy',    cadSystem: 'texasfile_fallback' },
  { name: 'Williamson', fips: '48491', key: 'williamson', cadSystem: 'bis_consultants' },
  { name: 'Wilson',     fips: '48493', key: 'wilson',     cadSystem: 'bis_consultants' },
  { name: 'Winkler',    fips: '48495', key: 'winkler',    cadSystem: 'texasfile_fallback' },
  { name: 'Wise',       fips: '48497', key: 'wise',       cadSystem: 'bis_consultants' },
  { name: 'Wood',       fips: '48499', key: 'wood',       cadSystem: 'texasfile_fallback' },
  { name: 'Yoakum',     fips: '48501', key: 'yoakum',     cadSystem: 'texasfile_fallback' },
  { name: 'Young',      fips: '48503', key: 'young',      cadSystem: 'bis_consultants' },
  { name: 'Zapata',     fips: '48505', key: 'zapata',     cadSystem: 'texasfile_fallback' },
  { name: 'Zavala',     fips: '48507', key: 'zavala',     cadSystem: 'texasfile_fallback' },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

/** Fast lookup maps (built once at module load time) */
const _byKey  = new Map<string, CountyRecord>(TEXAS_COUNTIES.map(c => [c.key,  c]));
const _byFips = new Map<string, CountyRecord>(TEXAS_COUNTIES.map(c => [c.fips, c]));
const _byName = new Map<string, CountyRecord>(
  TEXAS_COUNTIES.map(c => [c.name.toLowerCase().replace(/\s+/g, '_'), c]),
);

/**
 * Resolve a county name string to a CountyRecord.
 * Accepts any of: "Bell", "bell", "bell county", "BELL COUNTY", county key ("san_saba"), FIPS ("48027").
 */
export function resolveCounty(input: string): CountyRecord | null {
  if (!input) return null;
  const s = input.trim();

  // Try FIPS first (5-digit numeric)
  if (/^\d{5}$/.test(s)) return _byFips.get(s) ?? null;

  // Normalise to lowercase key: remove " county", replace spaces/hyphens with _
  const key = s
    .toLowerCase()
    .replace(/\s+county\s*$/i, '')
    .trim()
    .replace(/[\s-]+/g, '_');

  return _byKey.get(key) ?? _byName.get(key) ?? null;
}

/** Return the FIPS code for a county name, or null if not found */
export function countyToFIPS(countyName: string): string | null {
  return resolveCounty(countyName)?.fips ?? null;
}

/** Return the CAD system name for a county */
export function countyCadSystem(countyName: string): CadSystemName {
  return resolveCounty(countyName)?.cadSystem ?? 'texasfile_fallback';
}

/** Return all BIS Consultants counties (for cross-referencing with BIS_CONFIGS) */
export function getBisCounties(): CountyRecord[] {
  return TEXAS_COUNTIES.filter(c => c.cadSystem === 'bis_consultants');
}

/** Return all TrueAutomation counties */
export function getTrueAutoCounties(): CountyRecord[] {
  return TEXAS_COUNTIES.filter(c => c.cadSystem === 'trueautomation');
}

/**
 * Look up the 5-digit FIPS code for a Texas county name.
 * Accepts any form resolveCounty() handles (e.g. "Bell", "bell county", "48027").
 * Returns empty string if the county is not found or state is not TX/TEXAS.
 */
export function lookupCountyFIPS(countyName: string, state: string): string {
  if (state.toUpperCase() !== 'TX' && state.toUpperCase() !== 'TEXAS') return '';
  return resolveCounty(countyName)?.fips ?? '';
}

/**
 * Look up the county name (ALL CAPS) for a 5-digit Texas FIPS code.
 * Returns empty string if the FIPS is not found.
 */
export function lookupCountyName(fips: string): string {
  return _byFips.get(fips)?.name.toUpperCase() ?? '';
}
