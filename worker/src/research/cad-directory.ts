// worker/src/research/cad-directory.ts
//
// The Texas Comptroller's authoritative directory of all 254 county appraisal districts.
//
// WHY THIS EXISTS. `adapters/generic-cad-adapter.ts` finds a county's appraisal district by running
// a GOOGLE SEARCH and asking a vision model to pick the right link off the results page — once per
// county, every run. That is three separate problems in one: it costs a search plus an AI call each
// time; it depends on Google's result ordering, which is not ours to rely on; and it produces a URL
// nobody verified. A model picking from a search page can just as easily return a data broker, a
// paid aggregator, or a lookalike domain as the official district — and the pipeline would then
// present whatever it scraped as county appraisal data.
//
// That is this platform's signature defect stated exactly: an unknown rendered as an answer. The
// Comptroller publishes the fact, so we use the fact.
//
// GENERATED, NOT HAND-WRITTEN. Scraped from
// https://comptroller.texas.gov/taxes/property-tax/county-directory/ (index + 254 county pages, at
// ~4 requests/second) on 2026-08-03. Re-run the scraper to refresh; do not edit rows by hand, or the
// next refresh silently discards the edit.
//
// 241 of 254 districts publish a website. The other 13 are `null` ON PURPOSE — the Comptroller lists
// no site for them, and a null is what lets a caller fall back to discovery honestly. An earlier
// pass of the scraper wrote Motley's MAILING ADDRESS into the website field, which is the failure
// this file most needs to avoid: a populated-looking value is worse than an empty one, because
// nothing downstream can tell it is wrong.

export interface CadDirectoryEntry {
  /** County name as the Comptroller spells it, e.g. "McLennan". */
  county: string;
  /** The Comptroller's three-digit county number, e.g. "161". NOT the FIPS code. */
  number: string;
  district: string;
  /** Bare hostname, no scheme — e.g. "www.bellcad.org". `null` when none is published. */
  website: string | null;
  phone: string | null;
  email: string | null;
}

export const CAD_DIRECTORY: readonly CadDirectoryEntry[] = [
  { county: "Anderson", number: "001", district: "Anderson Appraisal District", website: "www.andersoncad.net", phone: "903-723-2949", email: "qbaack@andersoncad.net" },
  { county: "Andrews", number: "002", district: "Andrews Appraisal District", website: "www.andrewscad.org", phone: "432-523-9111", email: "chiefappraiser@andrewscad.org" },
  { county: "Angelina", number: "003", district: "Angelina Appraisal District", website: "www.angelinacad.org", phone: "936-634-8456", email: "cdowns@angelinacad.org" },
  { county: "Aransas", number: "004", district: "Aransas Appraisal District", website: "www.aransascad.org", phone: "361-729-9733", email: "aransascad@gmail.com" },
  { county: "Archer", number: "005", district: "Archer Appraisal District", website: "www.archercad.org", phone: "940-574-2172", email: "archcad@brazosnet.com" },
  { county: "Armstrong", number: "006", district: "Armstrong Appraisal District", website: null, phone: "806-331-9479", email: "armstrongcad@armstrongcad.org" },
  { county: "Atascosa", number: "007", district: "Atascosa Appraisal District", website: "www.atascosacad.com", phone: "830-569-8326", email: "ACAD@atascosacad.com" },
  { county: "Austin", number: "008", district: "Austin Appraisal District", website: "www.austincad.org", phone: "979-865-9124", email: "austincad@gmail.com" },
  { county: "Bailey", number: "009", district: "Bailey Appraisal District", website: "www.bailey-cad.org", phone: "806-272-5501", email: "baileyca@bailey-cad.org" },
  { county: "Bandera", number: "010", district: "Bandera Appraisal District", website: "www.bancad.org", phone: "830-796-3039", email: "info@bancad.org" },
  { county: "Bastrop", number: "011", district: "Bastrop Appraisal District", website: "www.bastropcad.org", phone: "512-303-1930", email: "publicinfo@bastropcad.org" },
  { county: "Baylor", number: "012", district: "Baylor Appraisal District", website: "www.baylorcad.org", phone: "940-888-5636", email: "pvaden@sraccess.net" },
  { county: "Bee", number: "013", district: "Bee Appraisal District", website: "www.beecad.org", phone: "361-358-0193", email: "bee@beecad.org" },
  { county: "Bell", number: "014", district: "Bell Appraisal District", website: "www.bellcad.org", phone: "254-939-5841", email: "customerservice@bellcad.org" },
  { county: "Bexar", number: "015", district: "Bexar Appraisal District", website: "www.bcad.org", phone: "210-242-2432", email: "cacomms@bcad.org" },
  { county: "Blanco", number: "016", district: "Blanco Appraisal District", website: "www.blancocad.com", phone: "830-868-4013", email: "info@blancocad.com" },
  { county: "Borden", number: "017", district: "Borden Appraisal District", website: "www.bordencad.org", phone: "806-756-4484", email: "bcad@bordencad.org" },
  { county: "Bosque", number: "018", district: "Bosque Appraisal District", website: "www.bosquecad.com", phone: "254-435-2304", email: "feedback@bosquecad.com" },
  { county: "Bowie", number: "019", district: "Bowie Appraisal District", website: "www.bowieappraisal.com", phone: "903-793-8936", email: "mbrower@bowieappraisal.org" },
  { county: "Brazoria", number: "020", district: "Brazoria Appraisal District", website: "www.brazoriacad.org", phone: "979-849-7792", email: "help@brazoriacad.org" },
  { county: "Brazos", number: "021", district: "Brazos Appraisal District", website: "brazoscad.org", phone: "979-774-4100", email: "info@brazoscad.org" },
  { county: "Brewster", number: "022", district: "Brewster Appraisal District", website: "www.brewstercotad.org", phone: "432-837-2558", email: "appraisaldistrict@brewstercotad.org" },
  { county: "Briscoe", number: "023", district: "Briscoe Appraisal District", website: "www.briscoecad.org", phone: "806-823-2161", email: "lrodriguez@briscoecad.org" },
  { county: "Brooks", number: "024", district: "Brooks Appraisal District", website: "www.brookscad.org", phone: "361-325-8120", email: "dgarcia@bcisd.us" },
  { county: "Brown", number: "025", district: "Brown Appraisal District", website: "www.brown-cad.org", phone: "325-643-5676", email: "appraisal@brown-cad.org" },
  { county: "Burleson", number: "026", district: "Burleson Appraisal District", website: "www.burlesonappraisal.com", phone: "979-567-2318", email: "public@burlesonappraisal.com" },
  { county: "Burnet", number: "027", district: "Burnet Appraisal District", website: "www.burnet-cad.org", phone: "512-756-8291", email: "info@burnetad.org" },
  { county: "Caldwell", number: "028", district: "Caldwell Appraisal District", website: "www.caldwellcad.org", phone: "512-398-5550", email: "publicinformation@caldwellcad.org" },
  { county: "Calhoun", number: "029", district: "Calhoun Appraisal District", website: "www.calhouncad.org", phone: "361-552-8808", email: "paul@calhouncad.org" },
  { county: "Callahan", number: "030", district: "Callahan Appraisal District", website: "www.callahancad.org", phone: "325-854-2528", email: "info@callahancad.org" },
  { county: "Cameron", number: "031", district: "Cameron Appraisal District", website: "www.cameroncad.org", phone: "956-399-9322", email: "public@cameroncad.org" },
  { county: "Camp", number: "032", district: "Camp Appraisal District", website: "www.campcad.org", phone: "903-856-6538", email: "j.tinsley@campcad.org" },
  { county: "Carson", number: "033", district: "Carson Appraisal District", website: "www.carsoncad.org", phone: "806-537-3569", email: "carsoncoappraisal@carsoncad.org" },
  { county: "Cass", number: "034", district: "Cass Appraisal District", website: "www.casscad.org", phone: "903-756-7545", email: "info@casscad.org" },
  { county: "Castro", number: "035", district: "Castro Appraisal District", website: null, phone: "806-647-5131", email: "castrocad35@outlook.com" },
  { county: "Chambers", number: "036", district: "Chambers Appraisal District", website: "www.chamberscad.org", phone: "409-267-3795", email: "info@chamberscad.org" },
  { county: "Cherokee", number: "037", district: "Cherokee Appraisal District", website: "www.cherokeecad.com", phone: "903-683-2296", email: "info@cherokeecad.net" },
  { county: "Childress", number: "038", district: "Childress Appraisal District", website: "www.childresscad.org", phone: "940-937-6062", email: "childresscad@childresstx.us" },
  { county: "Clay", number: "039", district: "Clay Appraisal District", website: "www.claycad.org", phone: "940-538-4311", email: "claycad1@gmail.com" },
  { county: "Cochran", number: "040", district: "Cochran Appraisal District", website: "www.cochrancad.com", phone: "806-266-5584", email: "vgarza@cochrancad.com" },
  { county: "Coke", number: "041", district: "Coke Appraisal District", website: "www.cokecad.org", phone: "325-453-4528", email: "dustin.vernor@cokecad.org" },
  { county: "Coleman", number: "042", district: "Coleman Appraisal District", website: "www.colemancad.net", phone: "325-625-4155", email: "info@colemancad.net" },
  { county: "Collin", number: "043", district: "Collin Appraisal District", website: "www.collincad.org", phone: "469-742-9200", email: "marty.wright@cadcollin.org" },
  { county: "Collingsworth", number: "044", district: "Collingsworth Appraisal District", website: "www.collingsworthcad.org", phone: "806-447-5172", email: "bjameson@collingsworthcad.org" },
  { county: "Colorado", number: "045", district: "Colorado Appraisal District", website: "www.coloradocad.org", phone: "979-732-8222", email: "janea@coloradocad.org" },
  { county: "Comal", number: "046", district: "Comal Appraisal District", website: "www.comalad.org", phone: "830-625-8597", email: "comalad@co.comal.tx.us" },
  { county: "Comanche", number: "047", district: "Comanche Appraisal District", website: "www.comanchecad.org", phone: "325-356-5253", email: "info@comanchecad.org" },
  { county: "Concho", number: "048", district: "Concho Appraisal District", website: "www.conchocad.org", phone: "325-732-4389", email: "cad@conchocad.org" },
  { county: "Cooke", number: "049", district: "Cooke Appraisal District", website: "www.cookecad.org", phone: "940-665-7651", email: "cookecad@cookecad.org" },
  { county: "Coryell", number: "050", district: "Coryell Appraisal District", website: "www.coryellcad.org", phone: "254-865-6593", email: "juliez@coryellcad.org" },
  { county: "Cottle", number: "051", district: "Cottle Appraisal District", website: "www.cottlecad.org", phone: "806-492-3345", email: "kbox@cottlecad.org" },
  { county: "Crane", number: "052", district: "Crane Appraisal District", website: "www.cranecad.org", phone: "432-558-1021", email: "bbitner@craneisd.com" },
  { county: "Crockett", number: "053", district: "Crockett Appraisal District", website: null, phone: "325-392-8258", email: null },
  { county: "Crosby", number: "054", district: "Crosby Appraisal District", website: "www.crosbycentral.org", phone: "806-675-2356", email: "info@crosbycentral.org" },
  { county: "Culberson", number: "055", district: "Culberson Appraisal District", website: "www.culbersoncad.org", phone: "432-283-2977", email: "cgonzalez@culbersoncad.org" },
  { county: "Dallam", number: "056", district: "Dallam Appraisal District", website: "www.dallamcad.org", phone: "806-249-6767", email: "hmccauley@dallamcad.org" },
  { county: "Dallas", number: "057", district: "Dallas Appraisal District", website: "www.dallascad.org", phone: "214-631-0910", email: "pubrel@dcad.org" },
  { county: "Dawson", number: "058", district: "Dawson Appraisal District", website: "www.dawsoncad.org", phone: "806-872-7060", email: "ca@dawsoncad.org" },
  { county: "Deaf Smith", number: "059", district: "Deaf Smith Appraisal District", website: "www.deafsmithcad.org", phone: "806-364-0625", email: "mpowers@deafsmithcad.org" },
  { county: "Delta", number: "060", district: "Delta Appraisal District", website: "www.delta-cad.org", phone: "903-395-4118", email: "support@delta-cad.org" },
  { county: "Denton", number: "061", district: "Denton Appraisal District", website: "www.dentoncad.com", phone: "940-349-3800", email: "info@dentoncad.com" },
  { county: "DeWitt", number: "062", district: "DeWitt Appraisal District", website: "www.dewittcad.org", phone: "361-275-5753", email: "information@dewittcad.org" },
  { county: "Dickens", number: "063", district: "Dickens Appraisal District", website: null, phone: "806-623-5258", email: null },
  { county: "Dimmitt", number: "064", district: "Dimmitt Appraisal District", website: "www.dimmit-cad.org", phone: "830-876-3420", email: "carrillo@dimmit-cad.org" },
  { county: "Donley", number: "065", district: "Donley Appraisal District", website: "www.donleycad.org", phone: "806-874-2744", email: "paula.lowrie@donleycad.org" },
  { county: "Duval", number: "066", district: "Duval Appraisal District", website: "www.duvalcad.org", phone: "361-279-3305", email: "raulgarcia@duvalcad.org" },
  { county: "Eastland", number: "067", district: "Eastland Appraisal District", website: "www.eastlandcad.org", phone: "254-629-8597", email: "info@eastlandcad.org" },
  { county: "Ector", number: "068", district: "Ector Appraisal District", website: "www.ectorcad.org", phone: "432-332-6834", email: "ector@ectorcad.org" },
  { county: "Edwards", number: "069", district: "Edwards Appraisal District", website: "edwardscad.org", phone: "830-683-4189", email: "ecad@swtexas.net" },
  { county: "Ellis", number: "070", district: "Ellis Appraisal District", website: "www.elliscad.org", phone: "972-937-3552", email: "ecad@elliscad.com" },
  { county: "El Paso", number: "071", district: "El Paso Appraisal District", website: "www.epcad.org", phone: "915-780-2131", email: "admin@epcad.org" },
  { county: "Erath", number: "072", district: "Erath Appraisal District", website: "www.erath-cad.com", phone: "254-965-5434", email: "admin@erathcad.iswdata.com" },
  { county: "Falls", number: "073", district: "Falls Appraisal District", website: "www.fallscad.net", phone: "254-883-2543", email: "info@fallscad.net" },
  { county: "Fannin", number: "074", district: "Fannin Appraisal District", website: "www.fannincad.org", phone: "903-583-8701", email: "tgamble@fannincad.org" },
  { county: "Fayette", number: "075", district: "Fayette Appraisal District", website: "www.fayettecad.org", phone: "979-968-8383", email: "inquiries@fayettecad.org" },
  { county: "Fisher", number: "076", district: "Fisher Appraisal District", website: "www.fishercad.org", phone: "325-776-2733", email: "hbufkin@fishercad.org" },
  { county: "Floyd", number: "077", district: "Floyd Appraisal District", website: "www.floydcad.org", phone: "806-983-5256", email: "floydcad@suddenlinkmail.com" },
  { county: "Foard", number: "078", district: "Foard Appraisal District", website: "www.foardcad.org", phone: "940-684-1225", email: "foardapp@yahoo.com" },
  { county: "Fort Bend", number: "079", district: "Fort Bend Appraisal District", website: "www.fbcad.org", phone: "281-344-8623", email: "info@fbcad.org" },
  { county: "Franklin", number: "080", district: "Franklin Appraisal District", website: "www.franklin-cad.org", phone: "903-537-2286", email: "support@franklin-cad.org" },
  { county: "Freestone", number: "081", district: "Freestone Appraisal District", website: "www.freestonecad.org", phone: "903-389-5510", email: "general.info@freestonecad.org" },
  { county: "Frio", number: "082", district: "Frio Appraisal District", website: "www.friocad.org", phone: "830-334-4163", email: "friocad@yahoo.com" },
  { county: "Gaines", number: "083", district: "Gaines Appraisal District", website: "www.gainescad.org", phone: "432-758-3263", email: "gainescad@gainescad.org" },
  { county: "Galveston", number: "084", district: "Galveston Appraisal District", website: "www.galvestoncad.org", phone: "409-935-1980", email: "gcad@galvestoncad.org" },
  { county: "Garza", number: "085", district: "Garza Appraisal District", website: "www.garzacad.org", phone: "806-495-3518", email: "chief@garzacad.org" },
  { county: "Gillespie", number: "086", district: "Gillespie Appraisal District", website: "www.gillespiecad.org", phone: "830-997-9807", email: "office@gillcad.org" },
  { county: "Glasscock", number: "087", district: "Glasscock Appraisal District", website: "www.glasscockcad.org", phone: "432-203-2215", email: "info@glasscockcad.org" },
  { county: "Goliad", number: "088", district: "Goliad Appraisal District", website: null, phone: "361-645-2507", email: "info@goliadisd.org" },
  { county: "Gonzales", number: "089", district: "Gonzales Appraisal District", website: "www.gonzalescad.org", phone: "830-672-2879", email: "gonzcad@gvec.net" },
  { county: "Gray", number: "090", district: "Gray Appraisal District", website: "www.graycad.org", phone: "806-665-0791", email: "info@graycad.org" },
  { county: "Grayson", number: "091", district: "Grayson Appraisal District", website: "www.graysonappraisal.org", phone: "903-893-9673", email: "webmaster@graysonappraisal.org" },
  { county: "Gregg", number: "092", district: "Gregg Appraisal District", website: "www.gcad.org", phone: "903-238-8823", email: "greggcad@gcad.org" },
  { county: "Grimes", number: "093", district: "Grimes Appraisal District", website: "www.grimescad.org", phone: "936-873-2163", email: "gcad@grimescad.org" },
  { county: "Guadalupe", number: "094", district: "Guadalupe Appraisal District", website: "www.guadalupead.org", phone: "830-303-3313", email: "psaseguin@guadalupead.org" },
  { county: "Hale", number: "095", district: "Hale Appraisal District", website: "www.halecad.org", phone: "806-293-4226", email: "halecad1981@halecad.org" },
  { county: "Hall", number: "096", district: "Hall Appraisal District", website: "www.hallcad.org", phone: "806-259-2393", email: "hallcad@hallcad.org" },
  { county: "Hamilton", number: "097", district: "Hamilton Appraisal District", website: "www.hamiltoncad.org", phone: "254-386-8945", email: "cmccarn@hamiltoncad.org" },
  { county: "Hansford", number: "098", district: "Hansford Appraisal District", website: "www.hansfordcad.org", phone: "806-659-5575", email: "bthompson@hansfordcad.org" },
  { county: "Hardeman", number: "099", district: "Hardeman Appraisal District", website: "www.hardemancad.org", phone: "940-663-2532", email: "hcad@qisd.net" },
  { county: "Hardin", number: "100", district: "Hardin Appraisal District", website: null, phone: "409-246-2507", email: "office@hardin-cad.org" },
  { county: "Harris", number: "101", district: "Harris Appraisal District", website: "www.hcad.org", phone: "713-957-7800", email: "tlorecords@hcad.org" },
  { county: "Harrison", number: "102", district: "Harrison Appraisal District", website: "www.harrisoncad.net", phone: "903-935-1991", email: "contact@harrisoncad.net" },
  { county: "Hartley", number: "103", district: "Hartley Appraisal District", website: "www.hartleycad.org", phone: "806-365-4515", email: "hartleyappr@hartleycad.com" },
  { county: "Haskell", number: "104", district: "Haskell Appraisal District", website: "www.haskellcad.com", phone: "940-864-3805", email: "jferguson@haskellcad.com" },
  { county: "Hays", number: "105", district: "Hays Appraisal District", website: "www.hayscad.com", phone: "512-268-2522", email: "info@hayscad.com" },
  { county: "Hemphill", number: "106", district: "Hemphill Appraisal District", website: "hemphillcad.org", phone: "806-323-8022", email: "hemphillcad@sbcglobal.net" },
  { county: "Henderson", number: "107", district: "Henderson Appraisal District", website: "www.henderson-cad.org", phone: "903-675-9296", email: "hendersoncad@hcadtx.org" },
  { county: "Hidalgo", number: "108", district: "Hidalgo Appraisal District", website: "www.hidalgoad.org", phone: "956-381-8466", email: "cs@hidalgoad.org" },
  { county: "Hill", number: "109", district: "Hill Appraisal District", website: "www.hillcad.org", phone: "254-582-2508", email: "hcad@hillcad.org" },
  { county: "Hockley", number: "110", district: "Hockley Appraisal District", website: "www.hockleycad.org", phone: "806-894-9654", email: "loriem@hockleycad.org" },
  { county: "Hood", number: "111", district: "Hood Appraisal District", website: "www.hoodcad.net", phone: "817-573-2471", email: "hoodapp@hoodcad.net" },
  { county: "Hopkins", number: "112", district: "Hopkins Appraisal District", website: "www.hopkinscad.com", phone: "903-885-2173", email: "help@hopkinscad.com" },
  { county: "Houston", number: "113", district: "Houston Appraisal District", website: "www.houstoncad.org", phone: "936-544-9655", email: "hcadadmin@houstoncad.net" },
  { county: "Howard", number: "114", district: "Howard Appraisal District", website: null, phone: "432-263-8301", email: "cad@howardcad.org" },
  { county: "Hudspeth", number: "115", district: "Hudspeth Appraisal District", website: "www.hudspethcad.org", phone: "915-369-4118", email: "hudspethappraisaldistrict@yahoo.com" },
  { county: "Hunt", number: "116", district: "Hunt Appraisal District", website: "www.hunt-cad.org", phone: "903-454-3510", email: "huntcad@hunt-cad.org" },
  { county: "Hutchinson", number: "117", district: "Hutchinson Appraisal District", website: "www.hutchinsoncad.org", phone: "806-274-2294", email: "hcad@hutchinsoncad.com" },
  { county: "Irion", number: "118", district: "Irion Appraisal District", website: "www.irioncad.org", phone: "325-835-3551", email: "irioncad@gmail.com" },
  { county: "Jack", number: "119", district: "Jack Appraisal District", website: "www.jackcad.org", phone: "940-567-6301", email: "jackcad119@jackcad.org" },
  { county: "Jackson", number: "120", district: "Jackson Appraisal District", website: "www.jacksoncad.org", phone: "361-782-7115", email: "info@jacksoncad.org" },
  { county: "Jasper", number: "121", district: "Jasper Appraisal District", website: "www.jaspercad.org", phone: "409-384-2544", email: "openrecords@jaspercad.org" },
  { county: "Jeff Davis", number: "122", district: "Jeff Davis Appraisal District", website: "www.jeffdaviscad.org", phone: "432-426-3210", email: "jeffdavisappraisal@yahoo.com" },
  { county: "Jefferson", number: "123", district: "Jefferson Appraisal District", website: "www.jcad.org", phone: "409-840-9944", email: "info@jcad.org" },
  { county: "Jim Hogg", number: "124", district: "Jim Hogg Appraisal District", website: "www.jimhogg-cad.org", phone: "361-527-4033", email: "csauceda@jimhogg-cad.org" },
  { county: "Jim Wells", number: "125", district: "Jim Wells Appraisal District", website: "www.jimwellscad.org", phone: "361-668-9656", email: "administration@jimwellscad.org" },
  { county: "Johnson", number: "126", district: "Johnson Appraisal District", website: "www.johnsoncad.com", phone: "817-648-3000", email: "jcad@johnsoncad.net" },
  { county: "Jones", number: "127", district: "Jones Appraisal District", website: "www.jonescad.org", phone: "325-823-2422", email: "jonescad@jonescad.org" },
  { county: "Karnes", number: "128", district: "Karnes Appraisal District", website: "www.karnescad.org", phone: "830-780-2433", email: "karnescad@karnescad.org" },
  { county: "Kaufman", number: "129", district: "Kaufman Appraisal District", website: null, phone: "972-932-6081", email: null },
  { county: "Kendall", number: "130", district: "Kendall Appraisal District", website: "www.kendallad.org", phone: "830-249-8012", email: "requestinfo@kendallad.org" },
  { county: "Kenedy", number: "131", district: "Kenedy Appraisal District", website: "www.kenedycad.org", phone: "361-294-5333", email: "appraiser@kenedycad.com" },
  { county: "Kent", number: "132", district: "Kent Appraisal District", website: "www.kentcad.org", phone: "806-237-3066", email: "kentco@caprock-spur.com" },
  { county: "Kerr", number: "133", district: "Kerr Appraisal District", website: "www.kerrcad.org", phone: "830-895-5223", email: "info@kerrcad.org" },
  { county: "Kimble", number: "134", district: "Kimble Appraisal District", website: "www.kimblecad.org", phone: "325-446-3717", email: "kcad@kimblecad.org" },
  { county: "King", number: "135", district: "King Appraisal District", website: "www.kingcad.org", phone: "806-596-4588", email: "kingcad@caprock-spur.com" },
  { county: "Kinney", number: "136", district: "Kinney Appraisal District", website: "www.kinneycad.org", phone: "830-563-2323", email: "kinneycad@sbcglobal.net" },
  { county: "Kleberg", number: "137", district: "Kleberg Appraisal District", website: null, phone: "361-595-5775", email: null },
  { county: "Knox", number: "138", district: "Knox Appraisal District", website: "www.knoxcad.com", phone: "940-459-3891", email: "knoxcad@yahoo.com" },
  { county: "Lamar", number: "139", district: "Lamar Appraisal District", website: "www.lamarcad.org", phone: "903-785-7822", email: "lamar@lamarcad.org" },
  { county: "Lamb", number: "140", district: "Lamb Appraisal District", website: "www.lambcad.org", phone: "806-385-6474", email: "lambcad@lambcad.org" },
  { county: "Lampasas", number: "141", district: "Lampasas Appraisal District", website: "www.lampasascad.com", phone: "512-556-8058", email: "info@lampasascad.com" },
  { county: "La Salle", number: "142", district: "La Salle Appraisal District", website: "www.lasallecad.com", phone: "830-879-4756", email: "office@lasallecad.com" },
  { county: "Lavaca", number: "143", district: "Lavaca Appraisal District", website: "www.lavacacad.com", phone: "361-798-4396", email: "lavacacad@lccad.net" },
  { county: "Lee", number: "144", district: "Lee Appraisal District", website: "www.lee-cad.org", phone: "979-542-9618", email: "info@leecad.net" },
  { county: "Leon", number: "145", district: "Leon Appraisal District", website: "www.leoncad.org", phone: "903-536-2252", email: "leoncentralappraisal@gmail.com" },
  { county: "Liberty", number: "146", district: "Liberty Appraisal District", website: "www.libertycad.com", phone: "936-336-5722", email: "lramirez@libertycad.com" },
  { county: "Limestone", number: "147", district: "Limestone Appraisal District", website: "www.limestonecad.com", phone: "254-729-3009", email: "limestone@limestonecad.net" },
  { county: "Lipscomb", number: "148", district: "Lipscomb Appraisal District", website: "www.lipscombcad.com", phone: "806-624-2881", email: "LCAD@amaonline.com" },
  { county: "Live Oak", number: "149", district: "Live Oak Appraisal District", website: "www.liveoakappraisal.com", phone: "361-449-2641", email: "liveoakcad@liveoakappraisal.com" },
  { county: "Llano", number: "150", district: "Llano Appraisal District", website: "www.llanocad.net", phone: "325-247-3065", email: "dbauman@llanocad.net" },
  { county: "Loving", number: "151", district: "Loving Appraisal District", website: "www.lovingcad.org", phone: "432-377-2201", email: "cadclerk@co.loving.tx.us" },
  { county: "Lubbock", number: "152", district: "Lubbock Appraisal District", website: "www.lubbockcad.org", phone: "806-762-5000", email: "info@lubbockcad.org" },
  { county: "Lynn", number: "153", district: "Lynn Appraisal District", website: "www.lynncad.org", phone: "806-561-5477", email: "info@lynncad.org" },
  { county: "Madison", number: "154", district: "Madison Appraisal District", website: "www.madisoncad.org", phone: "936-348-2783", email: "madisoncad@madisoncad.org" },
  { county: "Marion", number: "155", district: "Marion Appraisal District", website: "www.marioncad.org", phone: "903-665-2519", email: "helpdesk@marioncad.org" },
  { county: "Martin", number: "156", district: "Martin Appraisal District", website: "www.martincad.org", phone: "432-756-2823", email: "admin@martincad.org" },
  { county: "Mason", number: "157", district: "Mason Appraisal District", website: "www.masoncad.org", phone: "325-347-5989", email: "christel@masoncadtx.com" },
  { county: "Matagorda", number: "158", district: "Matagorda Appraisal District", website: "www.matagorda-cad.org", phone: "979-244-2031", email: "mcad@co.matagorda.tx.us" },
  { county: "Maverick", number: "159", district: "Maverick Appraisal District", website: "www.maverickcad.org", phone: "830-773-0255", email: "admin@maverickcad.org" },
  { county: "McCulloch", number: "160", district: "McCulloch Appraisal District", website: "www.mccullochcad.org", phone: "325-597-1627", email: "info@mccullochcad.org" },
  { county: "McLennan", number: "161", district: "McLennan Appraisal District", website: "www.mclennancad.org", phone: "254-752-9864", email: "mcadmail@mclennancad.org" },
  { county: "McMullen", number: "162", district: "McMullen Appraisal District", website: "www.mcmullencad.org", phone: "361-274-3638", email: "blaine.patterson@mcmullencounty.org" },
  { county: "Medina", number: "163", district: "Medina Appraisal District", website: "www.medinacad.org", phone: "830-741-3035", email: "cs@medinacad.org" },
  { county: "Menard", number: "164", district: "Menard Appraisal District", website: "www.menardcad.org", phone: "325-396-4784", email: "kwagner@menardcad.org" },
  { county: "Midland", number: "165", district: "Midland Appraisal District", website: "www.midcad.org", phone: "432-699-4991", email: "mcadhelp@midcad.org" },
  { county: "Milam", number: "166", district: "Milam Appraisal District", website: "www.milamad.org", phone: "254-697-6638", email: "rnichols@milamad.org" },
  { county: "Mills", number: "167", district: "Mills Appraisal District", website: "www.millscad.org", phone: "325-648-2253", email: "info@millscad.org" },
  { county: "Mitchell", number: "168", district: "Mitchell Appraisal District", website: "www.mitchellcad.org", phone: "325-728-5028", email: "mitchellcad1@outlook.com" },
  { county: "Montague", number: "169", district: "Montague Appraisal District", website: "iswdataclient.azurewebsites.net", phone: "940-894-6011", email: "mctad@windstream.net" },
  { county: "Montgomery", number: "170", district: "Montgomery Appraisal District", website: "www.mcad-tx.org", phone: "936-756-3354", email: "inquiries@mcad-tx.org" },
  { county: "Moore", number: "171", district: "Moore Appraisal District", website: "www.moorecad.org", phone: "806-935-4193", email: "janie@mcountycad.com" },
  { county: "Morris", number: "172", district: "Morris Appraisal District", website: "www.morriscad.com", phone: "903-645-5601", email: "sgolden@morriscad.com" },
  { county: "Motley", number: "173", district: "Motley Appraisal District", website: null, phone: "806-983-5256", email: "floydcad@suddenlinkmail.com" },
  { county: "Nacogdoches", number: "174", district: "Nacogdoches Appraisal District", website: "www.nacocad.org", phone: "936-560-3447", email: "hello@nacocad.org" },
  { county: "Navarro", number: "175", district: "Navarro Appraisal District", website: "www.navarrocad.com", phone: "903-872-6161", email: "general.info@navarrocad.com" },
  { county: "Newton", number: "176", district: "Newton Appraisal District", website: "www.newtoncad.org", phone: "409-379-3710", email: "ckelley@co.newton.tx.us" },
  { county: "Nolan", number: "177", district: "Nolan Appraisal District", website: "www.nolan-cad.org", phone: "325-235-8421", email: "nolancad@gmail.com" },
  { county: "Nueces", number: "178", district: "Nueces Appraisal District", website: "www.ncadistrict.com", phone: "361-881-9978", email: "info@nuecescad.net" },
  { county: "Ochiltree", number: "179", district: "Ochiltree Appraisal District", website: "www.ochiltreecad.org", phone: "806-435-9623", email: "ocadappr@ochiltreead.org" },
  { county: "Oldham", number: "180", district: "Oldham Appraisal District", website: "oldhamcad.org", phone: "806-267-2442", email: "oldhamcad@xit.net" },
  { county: "Orange", number: "181", district: "Orange Appraisal District", website: "www.orangecad.net", phone: "409-745-4777", email: "info@orangecad.net" },
  { county: "Palo Pinto", number: "182", district: "Palo Pinto Appraisal District", website: null, phone: "940-659-1281", email: "ppad@palopintocad.org" },
  { county: "Panola", number: "183", district: "Panola Appraisal District", website: "www.panolacad.org", phone: "903-693-2891", email: "dmcphail@panolacad.org" },
  { county: "Parker", number: "184", district: "Parker Appraisal District", website: "www.parkercad.org", phone: "817-596-0077", email: "parkercad@parkercad.org" },
  { county: "Parmer", number: "185", district: "Parmer Appraisal District", website: "www.parmercad.org", phone: "806-251-1405", email: "pcad@parmercad.org" },
  { county: "Pecos", number: "186", district: "Pecos Appraisal District", website: "www.pecoscad.org", phone: "432-336-7587", email: "scalderon@pecoscad.org" },
  { county: "Polk", number: "187", district: "Polk Appraisal District", website: "www.polkcad.org", phone: "936-327-2174", email: "support@polkcad.org" },
  { county: "Potter", number: "188", district: "Potter Appraisal District", website: "www.prad.org", phone: "806-358-1601", email: "info@prad.org" },
  { county: "Presidio", number: "189", district: "Presidio Appraisal District", website: "www.presidiocad.org", phone: "432-729-3431", email: "info@presidiocad.org" },
  { county: "Rains", number: "190", district: "Rains Appraisal District", website: "www.rainscad.org", phone: "903-473-2391", email: "rcadmail@rainscad.org" },
  { county: "Randall", number: "191", district: "Randall Appraisal District", website: "www.prad.org", phone: "806-358-1601", email: "info@prad.org" },
  { county: "Reagan", number: "192", district: "Reagan Appraisal District", website: "www.reagancad.org", phone: "325-884-3275", email: "reagancad@verizon.net" },
  { county: "Real", number: "193", district: "Real Appraisal District", website: "www.realcad.org", phone: "830-232-6248", email: "info@realcad.org" },
  { county: "Red River", number: "194", district: "Red River Appraisal District", website: "www.rrcad.org", phone: "903-427-4181", email: "info@rrcad.org" },
  { county: "Reeves", number: "195", district: "Reeves Appraisal District", website: "www.reeves-cad.org", phone: "432-445-5122", email: "info@Reeves-CAD.org" },
  { county: "Refugio", number: "196", district: "Refugio Appraisal District", website: "www.refugiocad.org", phone: "361-526-5994", email: "refugiocad@refugiocad.org" },
  { county: "Roberts", number: "197", district: "Roberts Appraisal District", website: "www.robertscad.org", phone: "806-868-5281", email: "hether.williams@co.roberts.tx.us" },
  { county: "Robertson", number: "198", district: "Robertson Appraisal District", website: "robertsoncad.com", phone: "979-828-5800", email: "rcad@robertsoncad.com" },
  { county: "Rockwall", number: "199", district: "Rockwall Appraisal District", website: "www.rockwallcad.com", phone: "972-771-2034", email: "info@rockwallcad.com" },
  { county: "Runnels", number: "200", district: "Runnels Appraisal District", website: "www.runnelscad.org", phone: "325-365-3583", email: "support@runnelscad.org" },
  { county: "Rusk", number: "201", district: "Rusk Appraisal District", website: "www.ruskcad.org", phone: "903-657-3578", email: "wcook@ruskcad.org" },
  { county: "Sabine", number: "202", district: "Sabine County Appraisal District", website: null, phone: "409-787-2777", email: "sabinecad@windstream.net" },
  { county: "San Augustine", number: "203", district: "San Augustine Appraisal District", website: "www.sanaugustinecad.org", phone: "936-275-3496", email: "sanaugcad@sbcglobal.net" },
  { county: "San Jacinto", number: "204", district: "San Jacinto Appraisal District", website: "www.sjcad.org", phone: "936-653-1450", email: "sjcad@sjcad.org" },
  { county: "San Patricio", number: "205", district: "San Patricio Appraisal District", website: "www.sanpatcad.org", phone: "361-364-5402", email: "jmlight@sanpatcad.org" },
  { county: "San Saba", number: "206", district: "San Saba Appraisal District", website: "www.sansabacad.org", phone: "325-372-5031", email: "sansabacad@gmail.com" },
  { county: "Schleicher", number: "207", district: "Schleicher Appraisal District", website: "www.schleichercad.org", phone: "325-853-2617", email: "schcad@schleichercad.org" },
  { county: "Scurry", number: "208", district: "Scurry Appraisal District", website: "www.scurrytex.com", phone: "325-573-8549", email: "scad@scurrytex.com" },
  { county: "Shackelford", number: "209", district: "Shackelford Appraisal District", website: "www.shackelfordcad.com", phone: "325-762-2207", email: "chief@shackelfordcad.com" },
  { county: "Shelby", number: "210", district: "Shelby Appraisal District", website: "www.shelbycad.com", phone: "936-598-6171", email: "scad@shelbycad.com" },
  { county: "Sherman", number: "211", district: "Sherman Appraisal District", website: "www.shermancad.org", phone: "806-366-5566", email: "ccopley@shermancad.org" },
  { county: "Smith", number: "212", district: "Smith Appraisal District", website: "www.smithcad.org", phone: "903-510-8600", email: "chiefappraiser@scad.org" },
  { county: "Somervell", number: "213", district: "Somervell Appraisal District", website: "www.somervellcad.net", phone: "254-897-4094", email: "wesrollen@somervellcad.net" },
  { county: "Starr", number: "214", district: "Starr Appraisal District", website: "www.starrcad.org", phone: "956-487-5613", email: "starrcad@starrcad.org" },
  { county: "Stephens", number: "215", district: "Stephens Appraisal District", website: "www.stephenscad.com", phone: "254-559-8233", email: "taxpayerconnection@stephenscad.com" },
  { county: "Sterling", number: "216", district: "Sterling Appraisal District", website: "www.sterlingcad.org", phone: "325-378-7711", email: "sterlingcad@sterlingcad.org" },
  { county: "Stonewall", number: "217", district: "Stonewall Appraisal District", website: "www.stonewallcad.org", phone: "940-989-3363", email: "stonewallcad@valornet.com" },
  { county: "Sutton", number: "218", district: "Sutton Appraisal District", website: "www.suttoncad.com", phone: "325-387-2809", email: "mgbustamante4@aol.com" },
  { county: "Swisher", number: "219", district: "Swisher Appraisal District", website: "www.swisher-cad.org", phone: "806-995-4118", email: "swishercad@gmail.com" },
  { county: "Tarrant", number: "220", district: "Tarrant Appraisal District", website: "www.tad.org", phone: "817-284-0024", email: "chiefappraiser@tad.org" },
  { county: "Taylor", number: "221", district: "Taylor Appraisal District", website: "www.taylor-cad.org", phone: "325-676-9381", email: "earnest@cadtx.org" },
  { county: "Terrell", number: "222", district: "Terrell Appraisal District", website: "www.terrellcad.org", phone: "432-345-2251", email: "tcad@terrell.esc18.net" },
  { county: "Terry", number: "223", district: "Terry Appraisal District", website: "terrycoad.org", phone: "806-637-6966", email: "e.olivas@windstream.net" },
  { county: "Throckmorton", number: "224", district: "Throckmorton Appraisal District", website: "www.throckmortoncad.org", phone: "940-213-1114", email: "dsmith@throckmortoncad.org" },
  { county: "Titus", number: "225", district: "Titus Appraisal District", website: "www.titus-cad.org", phone: "903-572-7939", email: "info@titus-cad.org" },
  { county: "Tom Green", number: "226", district: "Tom Green Appraisal District", website: "www.tomgreencad.com", phone: "325-658-5575", email: "info@tomgreencad.com" },
  { county: "Travis", number: "227", district: "Travis Appraisal District", website: "www.traviscad.org", phone: "512-834-9317", email: "csinfo@tcadcentral.org" },
  { county: "Trinity", number: "228", district: "Trinity Appraisal District", website: "trinitycad.net", phone: "936-642-1502", email: "gary.gallant@trinitycad.net" },
  { county: "Tyler", number: "229", district: "Tyler Appraisal District", website: "www.tylercad.net", phone: "409-283-3736", email: "info@tylercad.net" },
  { county: "Upshur", number: "230", district: "Upshur Appraisal District", website: "www.upshur-cad.org", phone: "903-843-3041", email: "amanda.thibodeaux@upshur-cad.org" },
  { county: "Upton", number: "231", district: "Upton Appraisal District", website: "www.uptoncad.org", phone: "432-652-3221", email: "info@uptoncad.org" },
  { county: "Uvalde", number: "232", district: "Uvalde Appraisal District", website: "www.uvaldecad.org", phone: "830-278-1106", email: "melissapulido@uvaldecad.org" },
  { county: "Val Verde", number: "233", district: "Val Verde Appraisal District", website: "www.valverdecad.org", phone: "830-774-4602", email: "info@valverdecad.org" },
  { county: "Van Zandt", number: "234", district: "Van Zandt Appraisal District", website: "www.vzcad.org", phone: "903-567-6171", email: "admin@vzcad.org" },
  { county: "Victoria", number: "235", district: "Victoria Appraisal District", website: "www.victoriacad.org", phone: "361-576-3621", email: "openrecords@victoriacad.org" },
  { county: "Walker", number: "236", district: "Walker Appraisal District", website: "walkercad.org", phone: "936-295-0402", email: "info@walkercad.org" },
  { county: "Waller", number: "237", district: "Waller Appraisal District", website: "www.waller-cad.org", phone: "979-921-0060", email: "beckyg@waller-cad.org" },
  { county: "Ward", number: "238", district: "Ward Appraisal District", website: "www.wardcad.org", phone: "432-943-3224", email: "wardcad@wardcadtx.org" },
  { county: "Washington", number: "239", district: "Washington Appraisal District", website: "www.washingtoncad.org", phone: "979-277-3740", email: "wcad@brenhamk-12.net" },
  { county: "Webb", number: "240", district: "Webb Appraisal District", website: "www.webbcad.org", phone: "956-718-4091", email: "webmaster@webbcad.org" },
  { county: "Wharton", number: "241", district: "Wharton Appraisal District", website: "www.whartoncad.net", phone: "979-532-8931", email: "information@whartoncad.net" },
  { county: "Wheeler", number: "242", district: "Wheeler Appraisal District", website: "www.wheelercad.org", phone: "806-826-5900", email: "admin@wheelercad.org" },
  { county: "Wichita", number: "243", district: "Wichita Appraisal District", website: "www.wadtx.com", phone: "940-322-2435", email: "wcad@wadtx.com" },
  { county: "Wilbarger", number: "244", district: "Wilbarger Appraisal District", website: "www.wilbargerappraisal.org", phone: "940-553-1857", email: "sburkett@wilbargerappraisal.org" },
  { county: "Willacy", number: "245", district: "Willacy Appraisal District", website: "www.willacycad.org", phone: "956-689-5979", email: "info@willacycad.org" },
  { county: "Williamson", number: "246", district: "Williamson Appraisal District", website: "www.wcad.org", phone: "512-930-3787", email: "pir@wcadhelp.zohodesk.com" },
  { county: "Wilson", number: "247", district: "Wilson Appraisal District", website: "wilson-cad.org", phone: "830-393-3065", email: "wilsoncad@wilson-cad.org" },
  { county: "Winkler", number: "248", district: "Winkler Appraisal District", website: "www.winklercad.org", phone: "432-586-2832", email: "winklercad10@yahoo.com" },
  { county: "Wise", number: "249", district: "Wise Appraisal District", website: "www.wise-cad.com", phone: "940-627-3081", email: "Info@wisecad.net" },
  { county: "Wood", number: "250", district: "Wood Appraisal District", website: "www.woodcad.net", phone: "903-763-4891", email: "tracyn@woodcad.org" },
  { county: "Yoakum", number: "251", district: "Yoakum Appraisal District", website: "www.yoakumcad.org", phone: "806-456-7101", email: "ycad@yoakumcad.org" },
  { county: "Young", number: "252", district: "Young Appraisal District", website: null, phone: "940-549-2392", email: null },
  { county: "Zapata", number: "253", district: "Zapata Appraisal District", website: "zapatacad.com", phone: "956-765-9988", email: "rmontes@zapatacountytx.org" },
  { county: "Zavala", number: "254", district: "Zavala Appraisal District", website: "www.zavalacad.com", phone: "830-374-3475", email: "zavalacad@zavalacad.com" },];

const BY_COUNTY = new Map<string, CadDirectoryEntry>(
  CAD_DIRECTORY.map((e) => [e.county.toLowerCase(), e]),
);

/** Look up a county's appraisal district.
 *
 *  Tolerates the spellings that reach us from deeds, GIS layers and user input: a trailing "County",
 *  a "CAD" suffix, and stray case or whitespace. Deliberately NOT fuzzy beyond that — a near-match
 *  here would silently point a run at the wrong county's appraisal roll, and this platform's rule is
 *  that an unmatched lookup returns null rather than a plausible neighbour. */
export function cadForCounty(county: string | null | undefined): CadDirectoryEntry | null {
  if (!county) return null;
  const key = county.toLowerCase().trim()
    .replace(/\s+county\s*$/, '')
    .replace(/\s+(cad|appraisal district)\s*$/, '')
    .trim();
  return BY_COUNTY.get(key) ?? null;
}

/** The official appraisal-district URL for a county, or null when the Comptroller lists none.
 *
 *  Returned with an explicit `https://` because callers hand it straight to a browser, and the
 *  stored value is a bare host. */
export function cadUrlForCounty(county: string | null | undefined): string | null {
  const host = cadForCounty(county)?.website;
  return host ? `https://${host}` : null;
}
