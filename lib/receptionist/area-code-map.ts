// lib/receptionist/area-code-map.ts — every North American area code, and where it rings from.
//
// Owner, 2026-10-06: "We need to check area codes and determine where the calls are from, and if
// they are some kind of 1-800 number that is likely spam. This might help us understand if the
// silent calls were more likely real people or not."
//
// One table, grouped by place so a person can audit it at a glance. Overlays share their state's
// line. Kinds beyond the fifty states:
//   toll_free   800 833 844 855 866 877 888 — call centres, and the opt-out line every robocall in
//               the log read out (877-556-9255). A toll-free caller ID on an INBOUND call is unusual:
//               legitimate toll-free numbers are mostly built to be called, not to call out.
//   premium     900 — pay-per-call.
//   caribbean   +1 numbers that are NOT in the US: Jamaica 876, Dominican Republic 809/829/849 and
//               the rest. They dial like a US number and bill like an international one — the
//               "one-ring" callback scam lives here.
//   canada      provinces and territories.
//   non_geographic  500/52x/533/544/566/577/588 personal-communication codes, 700, 710 (government).
//
// Area codes say where a number was ISSUED, not where the caller is: people keep their numbers when
// they move, and spoofed robocalls pick area codes at random. So this informs a person reading the
// log; lib/receptionist/screening.ts never screens on it.

export type AreaKind = 'us' | 'territory' | 'canada' | 'caribbean' | 'toll_free' | 'premium' | 'non_geographic';

export interface AreaInfo {
  code: string;
  /** "Texas", "Ontario", "Jamaica", "Toll-free". */
  place: string;
  /** Two-letter postal code for US states, territories and provinces; null otherwise. */
  abbr: string | null;
  kind: AreaKind;
}

const US: Array<[string, string, string]> = [
  ['Alabama', 'AL', '205 251 256 334 483 659 938'],
  ['Alaska', 'AK', '907'],
  ['Arizona', 'AZ', '480 520 602 623 928'],
  ['Arkansas', 'AR', '327 479 501 870'],
  ['California', 'CA', '209 213 279 310 323 341 350 357 369 408 415 424 442 510 530 559 562 619 626 628 650 657 661 669 707 714 738 747 760 805 818 820 831 840 858 909 916 925 949 951'],
  ['Colorado', 'CO', '303 719 720 748 970 983'],
  ['Connecticut', 'CT', '203 475 860 959'],
  ['Delaware', 'DE', '302'],
  ['District of Columbia', 'DC', '202 771'],
  ['Florida', 'FL', '239 305 321 324 352 386 407 448 561 645 656 689 727 728 754 772 786 813 850 863 904 941 954'],
  ['Georgia', 'GA', '229 404 470 478 678 706 762 770 912 943'],
  ['Hawaii', 'HI', '808'],
  ['Idaho', 'ID', '208 986'],
  ['Illinois', 'IL', '217 224 309 312 331 447 464 618 630 708 730 773 779 815 847 861 872'],
  ['Indiana', 'IN', '219 260 317 463 574 765 812 930'],
  ['Iowa', 'IA', '319 515 563 641 712'],
  ['Kansas', 'KS', '316 620 785 913'],
  ['Kentucky', 'KY', '270 364 502 606 859'],
  ['Louisiana', 'LA', '225 318 337 457 504 985'],
  ['Maine', 'ME', '207'],
  ['Maryland', 'MD', '227 240 301 410 443 667'],
  ['Massachusetts', 'MA', '339 351 413 508 617 774 781 857 978'],
  ['Michigan', 'MI', '231 248 269 313 517 586 616 679 734 810 906 947 989'],
  ['Minnesota', 'MN', '218 320 507 612 651 763 924 952'],
  ['Mississippi', 'MS', '228 601 662 769'],
  ['Missouri', 'MO', '235 314 417 557 573 636 660 816'],
  ['Montana', 'MT', '406'],
  ['Nebraska', 'NE', '308 402 531'],
  ['Nevada', 'NV', '702 725 775'],
  ['New Hampshire', 'NH', '603'],
  ['New Jersey', 'NJ', '201 551 609 640 732 848 856 862 908 973'],
  ['New Mexico', 'NM', '505 575'],
  ['New York', 'NY', '212 315 329 332 347 363 516 518 585 607 624 631 646 680 716 718 838 845 914 917 929 934'],
  ['North Carolina', 'NC', '252 336 472 704 743 828 910 919 980 984'],
  ['North Dakota', 'ND', '701'],
  ['Ohio', 'OH', '216 220 234 283 326 330 380 419 436 440 513 567 614 740 937'],
  ['Oklahoma', 'OK', '405 539 572 580 918'],
  ['Oregon', 'OR', '458 503 541 971'],
  ['Pennsylvania', 'PA', '215 223 267 272 412 445 484 570 582 610 717 724 814 835 878'],
  ['Rhode Island', 'RI', '401'],
  ['South Carolina', 'SC', '803 821 839 843 854 864'],
  ['South Dakota', 'SD', '605'],
  ['Tennessee', 'TN', '423 615 629 731 865 901 931'],
  ['Texas', 'TX', '210 214 254 281 325 346 361 409 430 432 469 512 682 713 726 737 806 817 830 832 903 915 936 940 945 956 972 979'],
  ['Utah', 'UT', '385 435 801'],
  ['Vermont', 'VT', '802'],
  ['Virginia', 'VA', '276 434 540 571 686 703 757 804 826 948'],
  ['Washington', 'WA', '206 253 360 425 509 564'],
  ['West Virginia', 'WV', '304 681'],
  ['Wisconsin', 'WI', '262 274 353 414 534 608 715 920'],
  ['Wyoming', 'WY', '307'],
];

const TERRITORIES: Array<[string, string, string]> = [
  ['Puerto Rico', 'PR', '787 939'],
  ['U.S. Virgin Islands', 'VI', '340'],
  ['Guam', 'GU', '671'],
  ['Northern Mariana Islands', 'MP', '670'],
  ['American Samoa', 'AS', '684'],
];

const CANADA: Array<[string, string, string]> = [
  ['Alberta', 'AB', '368 403 587 780 825'],
  ['British Columbia', 'BC', '236 250 257 604 672 778'],
  ['Manitoba', 'MB', '204 431 584'],
  ['New Brunswick', 'NB', '428 506'],
  ['Newfoundland and Labrador', 'NL', '709 879'],
  ['Nova Scotia / PEI', 'NS', '782 902'],
  ['Ontario', 'ON', '226 249 289 343 365 382 387 416 437 519 548 613 647 683 705 742 753 807 905 942'],
  ['Quebec', 'QC', '263 354 367 418 438 450 468 514 579 581 819 873'],
  ['Saskatchewan', 'SK', '306 474 639'],
  ['Northern Canada', 'NT', '867'],
];

const CARIBBEAN: Array<[string, string]> = [
  ['Bahamas', '242'], ['Barbados', '246'], ['Anguilla', '264'], ['Antigua and Barbuda', '268'],
  ['British Virgin Islands', '284'], ['Cayman Islands', '345'], ['Bermuda', '441'], ['Grenada', '473'],
  ['Turks and Caicos', '649'], ['Jamaica', '658 876'], ['Montserrat', '664'], ['Sint Maarten', '721'],
  ['Saint Lucia', '758'], ['Dominica', '767'], ['Saint Vincent', '784'], ['Dominican Republic', '809 829 849'],
  ['Trinidad and Tobago', '868'], ['Saint Kitts and Nevis', '869'],
];

const TABLE = new Map<string, AreaInfo>();
/** Codes listed under two places. A second listing would silently win, so it is recorded instead
 *  and a test insists the list is empty. */
export const DUPLICATE_CODES: string[] = [];
const put = (info: AreaInfo) => { if (TABLE.has(info.code)) DUPLICATE_CODES.push(info.code); TABLE.set(info.code, info); };
for (const [place, abbr, codes] of US) for (const code of codes.split(' ')) put({ code, place, abbr, kind: 'us' });
for (const [place, abbr, codes] of TERRITORIES) for (const code of codes.split(' ')) put({ code, place, abbr, kind: 'territory' });
for (const [place, abbr, codes] of CANADA) for (const code of codes.split(' ')) put({ code, place, abbr, kind: 'canada' });
for (const [place, codes] of CARIBBEAN) for (const code of codes.split(' ')) put({ code, place, abbr: null, kind: 'caribbean' });
for (const code of ['800', '833', '844', '855', '866', '877', '888']) put({ code, place: 'Toll-free', abbr: null, kind: 'toll_free' });
put({ code: '900', place: 'Premium-rate (900)', abbr: null, kind: 'premium' });
for (const code of ['500', '521', '522', '523', '524', '525', '526', '527', '528', '529', '533', '544', '566', '577', '588', '700', '710']) {
  put({ code, place: 'Non-geographic', abbr: null, kind: 'non_geographic' });
}

/** Everything the table knows about an area code, or null for a code not in service. */
export function lookupAreaCode(code: string | null | undefined): AreaInfo | null {
  return code ? TABLE.get(code) ?? null : null;
}

/** All codes for a place — used by the tests to check the table against itself. */
export function codesFor(place: string): string[] {
  return [...TABLE.values()].filter((i) => i.place === place).map((i) => i.code).sort();
}

export const AREA_CODE_COUNT = TABLE.size;
