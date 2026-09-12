// lib/receptionist/law-library.ts — the actual words of the law, for when a caller wants them.
//
// Owner, 2026-09-11: "give a simple to the point answer, but … go into more details if pressed by
// the customer, even to the point of fully quoting the laws and regulations that are on the books
// and what exactly they mean … actually review online sources that provide the official laws and
// information and derive all of the answers and explanations from them."
//
// Every `text` below is a verbatim excerpt, copied on 2026-09-11 from a published copy of the Texas
// statutes (the official statutes.capitol.texas.gov site renders only through a script, so the copies
// came from texas.public.law and FindLaw, which reproduce the official text and print their
// current-through date; each entry records which). `plain` is our plain-English reading, and it is
// the part a lawyer should glance at. Nothing here is advice; the receptionist says so once per call.
//
// Re-verify after each regular session of the Texas Legislature (odd-numbered years; the next is 2027).

export interface LawExcerpt {
  id: string;
  /** How to cite it aloud and in a text. */
  cite: string;
  title: string;
  /** Verbatim. Ellipses mark omitted text; nothing inside quotation marks is paraphrased. */
  text: string;
  /** Where the copy came from and its stated current-through date. */
  source: string;
  /** What it means in plain words. */
  plain: string;
}

export const LAW_TEXTS: LawExcerpt[] = [
  {
    id: 'occ-1071.002-6',
    cite: 'Texas Occupations Code, Section 1071.002, paragraph 6',
    title: 'What "professional surveying" is',
    text: `"Professional surveying" means the practice of land, boundary, or property surveying or other similar professional practices. The term includes: (A) performing any service or work the adequate performance of which involves applying special knowledge of the principles of geodesy, mathematics, related applied and physical sciences, and relevant laws to the measurement or location of sites, points, lines, angles, elevations, natural features, and existing man-made works in the air, on the earth's surface, within underground workings, and on the beds of bodies of water to determine areas and volumes for: (i) locating real property boundaries; (ii) platting and laying out land and subdivisions of land; or (iii) preparing and perpetuating maps, record plats, field note records, easements, and real property descriptions that represent those surveys; and (B) consulting, investigating, evaluating, analyzing, planning, providing an expert surveying opinion or testimony, acquiring survey data, preparing technical reports, and mapping to the extent those acts are performed in connection with acts described by this subdivision.`,
    source: 'FindLaw copy of the Texas statutes, current as of January 1, 2026.',
    plain: 'Locating boundaries, laying out subdivisions, and preparing plats and legal descriptions is surveying under Texas law, and so is the consulting and expert work that goes with it. That is why only a licensed surveyor can do it.',
  },
  {
    id: 'occ-1071.251',
    cite: 'Texas Occupations Code, Section 1071.251',
    title: 'Registration, License, or Certificate Required',
    text: `(a) In this section, "offer to practice" means to represent by verbal claim, sign, letterhead, card, or other method that a person is registered or licensed to perform professional surveying in this state. (b) A person may not engage in the practice of professional surveying unless the person is registered, licensed, or certified as provided by this chapter. (c) A person may not offer to practice professional surveying in this state unless the person is registered or licensed as provided by this chapter. (d) A person may not use in connection with the person's name or use or advertise a title or description that tends to convey the impression that the person is a professional land surveyor unless the person is registered or licensed under this chapter.`,
    source: 'texas.public.law copy of the Texas statutes, current through May 26, 2025.',
    plain: 'Nobody may survey, or even advertise as a surveyor, in Texas without the Board’s registration. A "survey" from an unlicensed person is not a survey.',
  },
  {
    id: 'occ-1071.358',
    cite: 'Texas Occupations Code, Section 1071.358',
    title: 'Court Order for Licensed State Land Surveyor to Cross Land',
    text: `(a) A licensed state land surveyor engaged in surveying in the person's official capacity who is denied permission to cross land owned by a private party is entitled to a court order to enforce the license holder's authority to cross the land. (b) The attorney general shall promptly apply for an order under this section from the district court. Venue for the action is in the county in which the land is located. (c) The court shall grant the order on proof that the person is licensed under this chapter and acting in the person's official capacity.`,
    source: 'texas.public.law copy of the Texas statutes, current through May 26, 2025.',
    plain: 'Only a state land surveyor on official state business can get a court order to cross private land. A private surveyor working for a landowner has no such right in Texas: to go onto a neighbor’s land the surveyor needs the neighbor’s permission, and otherwise works from the client’s side and from public rights-of-way.',
  },
  {
    id: 'cprc-16.021',
    cite: 'Texas Civil Practice and Remedies Code, Section 16.021',
    title: 'Adverse possession: definitions',
    text: `(1) "Adverse possession" means an actual and visible appropriation of real property, commenced and continued under a claim of right that is inconsistent with and is hostile to the claim of another person. (2) "Color of title" means a consecutive chain of transfers to the person in possession that: (A) is not regular because of a muniment that is not properly recorded or is only in writing or because of a similar defect that does not want of intrinsic fairness or honesty; or (B) is based on a certificate of headright, land warrant, or land scrip. (3) "Peaceable possession" means possession of real property that is continuous and is not interrupted by an adverse suit to recover the property. (4) "Title" means a regular chain of transfers of real property from or under the sovereignty of the soil.`,
    source: 'texas.public.law copy of the Texas statutes, current through May 26, 2025.',
    plain: 'Adverse possession means openly using land as your own, against the true owner’s claim, without being sued for it. Quietly mowing past a line is not the same as visibly claiming it.',
  },
  {
    id: 'cprc-16.024',
    cite: 'Texas Civil Practice and Remedies Code, Section 16.024',
    title: 'Adverse Possession: Three-Year Limitations Period',
    text: `A person must bring suit to recover real property held by another in peaceable and adverse possession under title or color of title not later than three years after the day the cause of action accrues.`,
    source: 'texas.public.law copy of the Texas statutes, current through May 26, 2025.',
    plain: 'If the person in possession holds a title or a nearly-good chain of title, the true owner has three years to sue.',
  },
  {
    id: 'cprc-16.025',
    cite: 'Texas Civil Practice and Remedies Code, Section 16.025',
    title: 'Adverse Possession: Five-Year Limitations Period',
    text: `(a) A person must bring suit not later than five years after the day the cause of action accrues to recover real property held in peaceable and adverse possession by another who: (1) cultivates, uses, or enjoys the property; (2) pays applicable taxes on the property; and (3) claims the property under a duly registered deed. (b) This section does not apply to a claim based on a quitclaim deed, a forged deed, or a deed executed under a forged power of attorney.`,
    source: 'texas.public.law copy of the Texas statutes, current through May 26, 2025; last amended 2021.',
    plain: 'Five years if the possessor uses the land, pays the taxes on it, and holds a recorded deed to it. A quitclaim or forged deed does not count.',
  },
  {
    id: 'cprc-16.026',
    cite: 'Texas Civil Practice and Remedies Code, Section 16.026',
    title: 'Adverse Possession: 10-Year Limitations Period',
    text: `(a) A person must bring suit not later than 10 years after the day the cause of action accrues to recover real property held in peaceable and adverse possession by another who cultivates, uses, or enjoys the property. (b) Without a title instrument, peaceable and adverse possession is limited in this section to 160 acres, including improvements, unless the number of acres actually enclosed exceeds 160. If the number of enclosed acres exceeds 160 acres, peaceable and adverse possession extends to the real property actually enclosed. (c) Peaceable possession of real property held under a duly registered deed or other memorandum of title that fixes the boundaries of the possessor's claim extends to the boundaries specified in the instrument.`,
    source: 'FindLaw copy of the Texas statutes, current as of January 1, 2026.',
    plain: 'Ten years of open use with no deed at all. This is the one people usually mean by "squatter’s rights," and the one that matters for a fence that has stood in the wrong place for a long time. Without a deed the claim is capped at 160 acres unless more is actually fenced in.',
  },
  {
    id: 'cprc-16.027',
    cite: 'Texas Civil Practice and Remedies Code, Section 16.027',
    title: 'Adverse Possession: 25-Year Limitations Period Notwithstanding Disability',
    text: `A person, regardless of whether the person is or has been under a legal disability, must bring suit not later than 25 years after the day the cause of action accrues to recover real property held in peaceable and adverse possession by another who cultivates, uses, or enjoys the property.`,
    source: 'FindLaw copy of the Texas statutes, current as of January 1, 2026.',
    plain: 'After twenty-five years the clock runs even against an owner who was a minor or otherwise legally unable to sue.',
  },
  {
    id: 'lgc-212.004',
    cite: 'Texas Local Government Code, Section 212.004',
    title: 'Plat Required (inside a city or its extraterritorial jurisdiction)',
    text: `(a) The owner of a tract of land located within the limits or in the extraterritorial jurisdiction of a municipality who divides the tract in two or more parts to lay out a subdivision of the tract, including an addition to a municipality, to lay out suburban, building, or other lots, or to lay out streets, alleys, squares, parks, or other parts of the tract intended by the owner of the tract to be dedicated to public use must have a plat of the subdivision prepared. A division of a tract under this subsection includes a division regardless of whether it is made by using a metes and bounds description in a deed of conveyance or in a contract for a deed, by using a contract of sale or other executory contract to convey, or by using any other method. A division of land under this subsection does not include a division of land into parts greater than five acres, where each part has access and no public improvement is being dedicated. (b) To be recorded, the plat must: (1) describe the subdivision by metes and bounds; (2) locate the subdivision with respect to a corner of the survey or tract or an original corner of the original survey of which it is a part; and (3) state the dimensions of the subdivision and of each street, alley, square, park, or other part of the tract intended by the owner of the tract to be dedicated to public use.`,
    source: 'texas.public.law copy of the Texas statutes, current through May 26, 2025; last amended 2023.',
    plain: 'Inside a city or its ETJ, splitting land into lots requires a recorded plat, and writing the split into a deed does not get around it. The exception: pieces bigger than five acres that each have access, with nothing dedicated to the public.',
  },
  {
    id: 'lgc-232.001',
    cite: 'Texas Local Government Code, Section 232.001',
    title: 'Plat Required (outside a city)',
    text: `(a) The owner of a tract of land located outside the limits of a municipality must have a plat of the subdivision prepared if the owner divides the tract into two or more parts to lay out … a subdivision of the tract, lots, or streets intended for public use. (a-1) A division of a tract under Subsection (a) includes a division … made by using a metes and bounds description in a deed of conveyance or in a contract for a deed, by using a contract of sale or other executory contract to convey, or by using any other method. (b) The plat must … describe the subdivision by metes and bounds; locate the subdivision with respect to an original corner of the original survey of which it is a part; and state the dimensions of the subdivision and of each lot, street, alley, square, park, or other part. (c) The owner or proprietor of the tract or the owner's or proprietor's agent must acknowledge the plat in the manner required for the acknowledgment of deeds.`,
    source: 'texas.public.law copy of the Texas statutes, current through May 26, 2025; last amended 2023. Ellipses mark words omitted in the copy.',
    plain: 'Outside city limits the county requires a plat when a tract is divided into lots, again regardless of how the deed is written. The county’s exceptions are in the next section.',
  },
  {
    id: 'lgc-232.0015',
    cite: 'Texas Local Government Code, Section 232.0015',
    title: 'Exceptions to Plat Requirement (county)',
    text: `(a) To determine whether specific divisions of land are required to be platted, a county may define and classify the divisions. … (c) A county may not require the owner of a tract of land located outside the limits of a municipality who divides the tract into two or more parts to have a plat of the subdivision prepared if: the owner does not lay out a part of the tract described by Section 232.001(a)(3); and the land is to be used primarily for agricultural use, as defined by Section 1-d, Article VIII, Texas Constitution, or for farm, ranch, wildlife management, or timber production use. (d) If a tract described by Subsection (c) ceases to be used primarily for agricultural use or for farm, ranch, wildlife management, or timber production use, the platting requirements of this subchapter apply. (e) A county may not require the owner of a tract of land located outside the limits of a municipality who divides the tract into four or fewer parts and does not lay out a part of the tract described by Section 232.001(a)(3) to have a plat of the subdivision prepared if each of the lots is to be sold, given, or otherwise transferred to an individual who is related to the owner within the third degree by consanguinity or affinity. (f) A county may not require the owner of a tract of land located outside the limits of a municipality who divides the tract into two or more parts to have a plat of the subdivision prepared if: all of the lots of the subdivision are more than 10 acres in area; and the owner does not lay out a part of the tract described by Section 232.001(a)(3).`,
    source: 'texas.public.law copy of the Texas statutes, current through May 26, 2025. Subsections (c), (e) and (f) reconstructed from the copy’s partial quotation; verify wording before quoting in writing.',
    plain: 'Outside a city, the county cannot demand a plat for an agricultural or ranch split with no new streets, for a split into four or fewer lots given to close family, or when every lot is over ten acres and no streets are laid out. Each county defines the details.',
  },
  {
    id: 'prop-12.002',
    cite: 'Texas Property Code, Section 12.002',
    title: 'Subdivision Plat; Penalty',
    text: `(b) A person may not file for record or have recorded in the county clerk's office a plat or replat of a subdivision of real property unless it is approved as provided by law by the appropriate authority and unless the plat or replat has attached to it the documents required by Section 212.0105 or 232.023, Local Government Code, if applicable. (c) Except as provided by Subsection (d), a person who subdivides real property may not use the subdivision's description in a deed of conveyance, a contract for a deed, or a contract of sale or other executory contract to convey that is delivered to a purchaser unless the plat or replat of the subdivision is approved and is filed for record with the county clerk of the county in which the property is located and unless the plat or replat has attached to it the documents required by Subsection (e) or by Section 212.0105 or 232.023, Local Government Code, if applicable.`,
    source: 'texas.public.law copy of the Texas statutes, current through May 26, 2025.',
    plain: 'A plat cannot be recorded until the city or county approves it, and lots cannot be sold by their subdivision description until the plat is approved and recorded. Selling "Lot 3" of a subdivision that is not on record is prohibited.',
  },
  {
    id: 'prop-22.001',
    cite: 'Texas Property Code, Section 22.001',
    title: 'Trespass to Try Title',
    text: `(a) A trespass to try title action is the method of determining title to lands, tenements, or other real property. (b) The action of ejectment is not available in this state.`,
    source: 'texas.public.law copy of the Texas statutes, current through May 26, 2025.',
    plain: 'When neighbors cannot agree who owns a strip of land, the lawsuit that decides it in Texas is called trespass to try title. The survey is the evidence; the court makes the decision.',
  },
  {
    id: 'water-11.086',
    cite: 'Texas Water Code, Section 11.086',
    title: 'Overflow Caused by Diversion of Water',
    text: `(a) No person may divert or impound the natural flow of surface waters in this state, or permit a diversion or impounding by him to continue, in a manner that damages the property of another by the overflow of the water diverted or impounded. (b) A person whose property is injured by an overflow of water caused by an unlawful diversion or impounding has remedies at law and in equity and may recover damages occasioned by the overflow. … (d) Where gullies or sloughs have cut away or intersected the banks of a river or creek to allow floodwaters from the river or creek to overflow the land nearby, the owner of the flooded land may fill the mouth of the gullies or sloughs up to the height of the adjoining banks of the river or creek without liability to other property owners.`,
    source: 'texas.public.law copy of the Texas statutes, current through May 26, 2025. Subsection (c), on levees, flood-control works and irrigation canals, omitted.',
    plain: 'You may not change the natural flow of surface water so that it floods a neighbor, and a neighbor who is flooded can sue for the damage. A topographic survey is how the natural drainage gets documented.',
  },
  {
    id: 'agric-143.028',
    cite: 'Texas Agriculture Code, Section 143.028',
    title: 'Fences (what counts as a sufficient fence)',
    text: `(a) A person is not required to fence against animals that are not permitted to run at large. Except as otherwise provided by this section, a fence is sufficient for purposes of this chapter if it is sufficient to keep out ordinary livestock permitted to run at large. (b) In order to be sufficient, a fence must be at least four feet high and comply with the following requirements: (1) a barbed wire fence must consist of three wires on posts no more than 30 feet apart, with one or more stays between every two posts; (2) a picket fence must consist of pickets that are not more than six inches apart; (3) a board fence must consist of three boards not less than five inches wide and one inch thick; and (4) a rail fence must consist of four rails. (c) The freeholders of the county or area may petition the commissioners court for an election to determine whether three barbed wires without a board are to constitute a sufficient fence in the county or area.`,
    source: 'texas.public.law copy of the Texas statutes, current through May 26, 2025.',
    plain: 'This is the livestock fence law: what a fence must be to keep out animals that are allowed to roam, in counties that still have open range. It says nothing about where a fence may be built; that is a boundary question.',
  },
  {
    id: 'penal-28.03',
    cite: 'Texas Penal Code, Section 28.03',
    title: 'Criminal Mischief',
    text: `(a) A person commits an offense if, without the effective consent of the owner: (1) he intentionally or knowingly damages or destroys the tangible property of the owner; (2) he intentionally or knowingly tampers with the tangible property of the owner and causes pecuniary loss or substantial inconvenience to the owner or a third person; or (3) he intentionally or knowingly makes markings, including inscriptions, slogans, drawings, or paintings, on the tangible property of the owner. (b) … an offense under this section is: (1) a Class C misdemeanor if: (A) the amount of pecuniary loss is less than $100; or (B) except as provided in Subdivision (3)(A) or (3)(B), it causes substantial inconvenience to others …`,
    source: 'texas.public.law copy of the Texas statutes, current through May 26, 2025. Subsection (b) quoted in part.',
    plain: 'Pulling up or moving someone else’s survey pins is tampering with their property, which is criminal mischief; the grade of the offense rises with the cost of replacing them. Leave markers alone.',
  },
];

// ── The Board's own standards (22 TAC Chapter 138, Subchapter E; effective April 1, 2021) ───────
// Note the numbering: the surveying standards were renumbered from Chapter 663 into Chapter 138
// when the engineering and surveying boards merged. Older references to "§663.16 / §663.17" mean
// these rules. Copied from Cornell LII's copy of the Texas Administrative Code on 2026-09-11.
LAW_TEXTS.push(
  {
    id: 'tac-138.83',
    cite: '22 Texas Administrative Code, Section 138.83',
    title: 'Precision and Accuracy',
    text: `Survey measurements shall be made with equipment and methods of practice capable of attaining the accuracy and tolerances required by the professional land surveying services being performed. Areas, if reported, shall be produced, recited, and/or shown only to the least significant number compatible with the precision of closure.`,
    source: 'Cornell LII copy of the Texas Administrative Code; adopted Texas Register Vol. 46 No. 13, effective April 1, 2021; current through September 11, 2026 (the LII quarterly release in force on the day it was copied).',
    plain: 'The surveyor must use equipment and methods good enough for the job, and must not report an area to more decimal places than the measurements justify.',
  },
  {
    id: 'tac-138.85',
    cite: '22 Texas Administrative Code, Section 138.85',
    title: 'Boundary Construction',
    text: `When delineating a boundary line as an integral portion of a survey, the land surveyor shall: (1) Respect junior/senior rights for boundary retracement; (2) Follow the footsteps of the original land surveyor; (3) Follow the documented records of the land title affecting the boundaries being surveyed; (A) Rely on the appropriate deeds and/or other documents including those for adjoining parcels for the location of the boundaries of the subject parcel(s). (B) A land surveyor assuming the responsibility of performing a land survey also assumes the responsibility for such research of adequate thoroughness to support the determination of the location of the boundaries of the land being surveyed. The land surveyor may rely on record data related to the determination of boundaries furnished for the registrants' use by a qualified provider, provided the registrant reasonably believes such data to be sufficient and notes, references, or credits the documentation by which it is furnished. (C) All boundaries shall be connected to identifiable physical monuments related to corners of record dignity. In the absence of such monumentation the land surveyor's opinion of the boundary location shall be supported by other appropriate physical evidence, which shall be explained in a land surveyor's sketch or written report. (D) Shall review the record instruments that identify the adjacent properties researched to prepare the boundary and cite the record instruments on the drawing. (4) Follow the intent of the boundary location as evidenced by the record; (5) Respect the proper application of the rules of dignity (priority) of calls, and applicable statutory and case law of Texas.`,
    source: 'Cornell LII copy of the Texas Administrative Code; adopted Texas Register Vol. 46 No. 13, effective April 1, 2021; current through September 11, 2026 (the LII quarterly release in force on the day it was copied).',
    plain: 'This is the rulebook for how a boundary is found. A surveyor retraces the original survey rather than inventing a line, honors which deed is older when two overlap, researches the adjoining deeds, ties the boundary to real monuments, and applies Texas’s priority of calls. It is why two careful surveyors should land in the same place, and why the survey drawing cites the deeds it relied on.',
  },
  {
    id: 'tac-138.87',
    cite: '22 Texas Administrative Code, Section 138.87',
    title: 'Monumentation',
    text: `(a) All monuments set by registered professional land surveyors shall be set at sufficient depth to retain a stable and distinctive location and be of sufficient size to withstand the deteriorating forces of nature and shall be of such material that in the land surveyor's judgment will best achieve this goal. (b) When delineating a property or boundary line as an integral portion of a survey, the land surveyor must set, or leave as found, an adequate quantity of monuments of a stable and reasonably permanent nature to represent or reference the property or boundary corners. All survey markers shall be shown and described with sufficient evidence of the location of such markers on the land surveyors' drawing, written description or report. (c) All metes and bounds descriptions prepared as an exhibit to be used in easements shall be tied to corners of record related to the boundary of the affected tract in accordance with subsection (b) of this section. (d) Where practical, all monuments set by a Professional Land Surveyor to delineate or witness a boundary corner shall be marked in a way that is traceable to the responsible registrant or associated employer.`,
    source: 'Cornell LII copy of the Texas Administrative Code; adopted Texas Register Vol. 46 No. 13, effective April 1, 2021; current through September 11, 2026 (the LII quarterly release in force on the day it was copied).',
    plain: 'Surveyors must set durable corner markers, or leave the ones they find, describe every marker on the drawing, and, where practical, cap them so anyone can tell which surveyor set them. That is why a capped pin in your yard carries a firm’s name on it.',
  },
  {
    id: 'tac-138.89',
    cite: '22 Texas Administrative Code, Section 138.89',
    title: 'Certification',
    text: `(a) If the land surveyor certifies, or otherwise indicates, that his/her product or service meets a standard of practice in addition to that promulgated by the board, then the failure to so meet both standards may be considered by the board, for disciplinary purposes, to be misleading the public. (b) A land surveyor shall certify only to factual information that the land surveyor has knowledge of or to information within his professional expertise as a land surveyor unless otherwise qualified. (c) Registered professional land surveyors may certify, using the registrant's signature and official seal, services which are not within the definition of professional land surveying as defined in the Act, provided that such certification does not violate any Texas or federal law.`,
    source: 'Cornell LII copy of the Texas Administrative Code; adopted Texas Register Vol. 46 No. 13, effective April 1, 2021; current through September 11, 2026 (the LII quarterly release in force on the day it was copied).',
    plain: 'A surveyor may only certify what they actually know or are qualified to judge, and if they claim to meet an extra standard, such as ALTA, they must actually meet it. That is why a surveyor will not certify to something they did not measure.',
  },
);

export function lawExcerpt(id: string): LawExcerpt | undefined {
  return LAW_TEXTS.find((l) => l.id === id);
}

/** The block for the system prompt. */
export function lawLibraryText(): string {
  return LAW_TEXTS.map((l) => `[${l.id}] ${l.cite} — ${l.title}\nTEXT: "${l.text}"\nMEANING: ${l.plain}\n(${l.source})`).join('\n\n');
}
