// lib/receptionist/situations.ts — what callers actually ask, with a short answer, a longer one,
// and the law behind it.
//
// Owner, 2026-09-11: "consider other conditions and situations a customer might ask about and make
// it so that the agent is prepared to answer … a simple to the point answer, but should also be
// able to go into more details if pressed."
//
// `short` is the first thing said (one or two sentences). `more` is what follows if the caller wants
// it. `laws` are ids in ./law-library.ts, whose verbatim text is what the receptionist reads if the
// caller asks for the actual law. `surveyor` is what Starr can do about it. Statements of law here
// are derived from the excerpts in the law library and the sources in ./knowledge.ts; where a point
// rests on Texas case law rather than a statute, it says so.
import { OWNER_NAME as OWNER } from './knowledge';

export interface Situation {
  id: string;
  ask: string;
  short: string;
  more: string;
  surveyor: string;
  laws: string[];
}

export const SITUATIONS: Situation[] = [
  {
    id: 'neighbor-built-over-line',
    ask: 'I think my neighbor’s shed, fence, or driveway is on my side of the line. What do I do?',
    short: `First find out where the line really is; only a survey answers that. Then the options run from a conversation with the neighbor, to a written agreement, to court as the last resort.`,
    more: `Once a surveyor marks the line and shows the encroachment on a drawing, most neighbors work it out: the improvement gets moved, or the two of you sign and record a boundary line agreement or a small easement, or one buys the strip from the other. If it can’t be settled, the Texas lawsuit that decides ownership is called trespass to try title, and long-standing use can raise adverse-possession questions. Nobody can force a neighbor to move anything without a court order.`,
    surveyor: `${OWNER} can retrace and mark the line in question, document the encroachment on a sealed exhibit, and replace missing corner pins. A dispute usually needs only that one line, not a full boundary survey of the whole tract, so it usually costs less than most jobs, unless the corners can’t be found, the deeds conflict, the line is a creek, or the drawing must stand up in court.`,
    laws: ['prop-22.001', 'cprc-16.021', 'cprc-16.026'],
  },
  {
    id: 'my-fence-over-line',
    ask: 'My neighbor says my fence is on their property.',
    short: `The same first step: a survey to see where the line is. Fences are very often not on the line, in either direction.`,
    more: `If the fence is over, the usual fix is to move it or agree in writing to leave it. A fence that has stood for a long time does not move the line by itself; whether long use changes anything is an adverse-possession question that needs a lawyer.`,
    surveyor: `${OWNER} can locate the line and show exactly how far the fence is off, on a drawing both sides can rely on.`,
    laws: ['cprc-16.026', 'cprc-16.021'],
  },
  {
    id: 'fence-cost-and-ownership',
    ask: 'Who owns the fence between us, and who pays for a new one?',
    short: `Texas has no general law that makes neighbors split a fence, so it comes down to agreement, unless a subdivision’s deed restrictions say otherwise.`,
    more: `The fence belongs to whoever built it, on whoever’s land it stands. The state fence law only sets what a fence must be to keep out livestock in open-range areas; it doesn’t assign the cost. Put any cost-sharing agreement in writing.`,
    surveyor: `If nobody knows whose land the fence is on, a survey settles that part.`,
    laws: ['agric-143.028'],
  },
  {
    id: 'building-a-fence',
    ask: 'I want to build a fence. Do I need a survey, and where can it go?',
    short: `No law requires a survey first, but it’s the cheapest insurance there is: a fence on the wrong side is the number one cause of boundary fights.`,
    more: `The fence should sit on your side of the line, and inside any platted building line or easement where the plat or the city restricts fences. Inside a city, check the fence ordinance for height and setback; in a subdivision, check the deed restrictions. In the unincorporated county there is usually no fence ordinance.`,
    surveyor: `${OWNER} can locate and pin the corners and, if you want, mark the line with flags so the fence crew has something to build to.`,
    laws: [],
  },
  {
    id: 'livestock-fence',
    ask: 'Do I have to fence my land against livestock, and what counts as a fence?',
    short: `It depends on whether your county is open range or closed range. In open range, the burden is on you to fence animals out; the state law says what a sufficient fence is.`,
    more: `A sufficient fence is at least four feet high: three barbed wires on posts no more than thirty feet apart with stays between, or pickets no more than six inches apart, or three boards, or four rails. Most Central Texas counties have voted to become closed range for at least some animals; the county clerk can tell you.`,
    surveyor: `Fence lines on ranch tracts are exactly where old surveys and old fences disagree; ${OWNER} can retrace the true line before you rebuild miles of fence.`,
    laws: ['agric-143.028'],
  },
  {
    id: 'tree-over-line',
    ask: 'My neighbor’s tree hangs over my yard, or its roots are damaging my driveway.',
    short: `In Texas you may generally trim branches and roots back to the property line at your own expense, but you may not go onto the neighbor’s land or kill the tree. That rule comes from court decisions, not a statute.`,
    more: `Where the line is decides what you may cut. Damage from a healthy tree is usually not the neighbor’s liability; damage from a tree they knew was dead or dangerous may be. Talk first, and check city tree ordinances, which can protect certain trees.`,
    surveyor: `A survey shows where the trunk and the line are, which is the whole question.`,
    laws: [],
  },
  {
    id: 'buying-do-i-need-survey',
    ask: 'I’m buying a house or land. Do I need a survey?',
    short: `Your lender and title company decide whether they require one, and most lenders do. Even when they don’t, we recommend one: it’s how you find out what you are actually buying.`,
    more: `In Texas a seller can often reuse an existing survey with a T-47 affidavit swearing nothing has changed, if the title company and lender accept it. A new survey is the only way to know about encroachments, easements, and whether the fences match the deed. For a purchase, the survey most lenders and title companies want is a boundary and improvements survey.`,
    surveyor: `${OWNER} can do the survey your title company asks for and certify it to you, your lender, and the title company.`,
    laws: [],
  },
  {
    id: 'selling-existing-survey',
    ask: 'I’m selling. Can I use the survey I got when I bought?',
    short: `Often yes, with a T-47 affidavit stating nothing has changed, if the buyer’s title company and lender accept it. If you’ve added a fence, pool, shed, or addition, expect to need a new one.`,
    more: `The affidavit is a Texas Department of Insurance form your title company provides. Lenders and title companies commonly want a survey less than six to twelve months old.`,
    surveyor: `${OWNER} can update your old survey or do a new one certified to the new buyer and lender.`,
    laws: [],
  },
  {
    id: 'lender-which-survey',
    ask: 'The lender says I need a survey. Which kind?',
    short: `For a home loan, usually a boundary and improvements survey, sometimes called a mortgage or loan survey. For a commercial loan, usually an ALTA/NSPS land title survey.`,
    more: `Ask the title company for their survey requirements in writing; the certification wording and the items they want shown are set by them, and a survey done to the wrong standard gets rejected.`,
    surveyor: `Send us the title commitment and requirements and ${OWNER} will quote the right survey.`,
    laws: [],
  },
  {
    id: 'split-land-for-family',
    ask: 'I want to give part of my land to my child, or sell off a piece. Do I need a plat?',
    short: `Usually yes, but there are exceptions. Inside a city or its ETJ, pieces over five acres with access need no plat. Outside a city, the county cannot require one for a split into four or fewer lots given to close family, for agricultural or ranch splits, or when every lot is over ten acres, as long as no streets are laid out.`,
    more: `Everywhere else a recorded plat approved by the city or county is required, and writing the split as metes and bounds in a deed does not avoid it. Lots cannot be sold by a subdivision description until the plat is recorded, and the county clerk may refuse to record the deed without one. Each county defines its own exceptions, so check with the county before you rely on one.`,
    surveyor: `${OWNER} does the survey of the piece, writes the legal description, and prepares the plat when one is required.`,
    laws: ['lgc-212.004', 'lgc-232.001', 'lgc-232.0015', 'prop-12.002'],
  },
  {
    id: 'sell-lots-no-plat',
    ask: 'Can I sell lots from my land without recording a plat?',
    short: `Not by a subdivision description, and not inside the platting rules: the plat has to be approved and recorded first, or the sale is prohibited.`,
    more: `The Property Code bars using a subdivision’s lot description in a deed or contract until the plat is approved and on record, and the city or county rules bar the division itself without a plat, with the exceptions for large tracts, family splits, and farm use.`,
    surveyor: `Get the survey and plat done first; it is far cheaper than unwinding sales later.`,
    laws: ['prop-12.002', 'lgc-212.004', 'lgc-232.001'],
  },
  {
    id: 'landlocked',
    ask: 'My land has no road access. Can I get across the neighbor’s land?',
    short: `Sometimes. Texas courts recognize an easement by necessity when a tract was cut off from the road by an earlier split of the same land, and an easement by long use in some cases. It is a lawsuit question.`,
    more: `The cleanest answer is a written, recorded access easement from the neighbor. Utility companies and some counties will not serve a tract without legal access.`,
    surveyor: `${OWNER} can survey and describe the easement strip for the recorded document, and research the old deeds that show how the tract got cut off.`,
    laws: [],
  },
  {
    id: 'easement-can-i-build',
    ask: 'There’s a utility easement on my lot. Can I build on it?',
    short: `Generally no permanent structure inside an easement without the easement holder’s permission; fences and driveways are often tolerated but can be removed if the utility needs access.`,
    more: `Recorded easements are in your deed records and on your plat; the terms of the easement control what is allowed. Ask the utility in writing before building.`,
    surveyor: `A survey shows the recorded easements on the ground so you can see what is inside them.`,
    laws: [],
  },
  {
    id: 'neighbor-using-my-land',
    ask: 'The neighbor has used a strip of my land, or a road across it, for years. Have I lost it?',
    short: `Not automatically. Texas adverse possession takes open, hostile use for three, five, ten, or twenty-five years depending on the circumstances, and a lawsuit to decide it.`,
    more: `Ten years of open use with no deed is the common case; five years if they pay the taxes and hold a recorded deed; three with a good chain of title. Permission defeats it: if you allowed the use, it is not adverse. Long use of a road can also become a prescriptive easement. See a lawyer before the clock matters.`,
    surveyor: `${OWNER} can show on a survey exactly what has been used and where the line is, which is the evidence either side needs.`,
    laws: ['cprc-16.021', 'cprc-16.024', 'cprc-16.025', 'cprc-16.026', 'cprc-16.027'],
  },
  {
    id: 'deed-acreage-differs',
    ask: 'My deed says five acres but the survey says four point eight. Which is right?',
    short: `The boundaries control, not the number. The acreage in a deed is a calculation from the described lines, and old calculations are often off.`,
    more: `Texas courts resolve conflicts in a description in a set order: natural monuments like creeks first, then artificial monuments like pins, then the bearings and distances, then the stated area last. So a modern survey of the real corners is more reliable than the old acreage. If you were charged by the acre, that is a contract question for a lawyer.`,
    surveyor: `${OWNER} retraces the original corners and reports the true area; the survey explains where the difference comes from.`,
    laws: [],
  },
  {
    id: 'two-surveys-disagree',
    ask: 'An old survey and a new survey don’t match. Which one is right?',
    short: `Neither is automatically right; the question is which one found and honored the original corners. Surveyors retrace the original survey, they do not create new lines.`,
    more: `Differences come from better measurement, corners that were missed, or a different reading of the deeds. Two licensed surveyors can talk it through; if they still disagree and it matters, it becomes a legal question.`,
    surveyor: `${OWNER} can review both surveys, look for the original monuments, and explain the difference.`,
    laws: ['occ-1071.002-6', 'tac-138.85'],
  },
  {
    id: 'corner-pins-missing',
    ask: 'The corner pins are gone, or I think the neighbor pulled them up.',
    short: `Missing pins don’t move the line; a surveyor can re-establish them. Pulling up or moving someone else’s survey markers is criminal mischief under Texas law.`,
    more: `Surveyors are required by Board rule to set durable, identifiable monuments. If pins were destroyed, note when and by whom if you know, and don’t set your own; a homemade pin is not evidence of anything.`,
    surveyor: `${OWNER} can recover the corners from the record and the remaining evidence and set new capped pins.`,
    laws: ['penal-28.03', 'tac-138.87'],
  },
  {
    id: 'surveyor-on-neighbor-land',
    ask: 'Can the surveyor go onto my neighbor’s land? Can I keep a surveyor off mine?',
    short: `A private surveyor needs the landowner’s permission to enter; there is no general right of entry for private surveys in Texas. Only a state land surveyor on official state business can get a court order to cross land.`,
    more: `In practice surveyors ask, and most neighbors say yes because the survey helps them too. Without permission the surveyor works from the client’s land and public road right-of-way, which can still locate the line. If you refuse a surveyor, they may still measure to your side from the other side.`,
    surveyor: `${OWNER} will ask your neighbor for permission when it is needed, and tell you if it was refused.`,
    laws: ['occ-1071.358'],
  },
  {
    id: 'setbacks',
    ask: 'How close to the property line can I build?',
    short: `That is set by the city’s zoning and by your subdivision plat and deed restrictions, not by state law. In the unincorporated county there is often no setback beyond what the plat says.`,
    more: `A survey shows the platted building lines and easements; the city planning office tells you the zoning setbacks; the HOA or deed restrictions may add more.`,
    surveyor: `${OWNER} can locate the building lines and stake the proposed footprint so you can see exactly where it would sit.`,
    laws: [],
  },
  {
    id: 'flood-zone',
    ask: 'Am I in a flood zone? My insurance went up.',
    short: `Flood zones are FEMA’s maps, and you can check any address at the FEMA Flood Map Service Center. If a building sits higher than the map assumes, an elevation certificate can lower the premium or remove it from the zone.`,
    more: `An elevation certificate is a FEMA form a surveyor completes from measured elevations. A LOMA, a Letter of Map Amendment, is the FEMA process that uses it to take a property out of the mapped zone.`,
    surveyor: `${OWNER} prepares elevation certificates and the survey information for a LOMA.`,
    laws: [],
  },
  {
    id: 'water-runoff',
    ask: 'The neighbor’s new construction sends water onto my property.',
    short: `Texas law says nobody may divert or impound the natural flow of surface water in a way that floods another’s property, and the flooded owner can recover damages.`,
    more: `The usual proof is where the water naturally flowed before, which is what a topographic survey documents. Levees and flood-control works have their own rules.`,
    surveyor: `${OWNER} can map the drainage before and after with a topographic survey, which is the evidence for a claim or for a fix.`,
    laws: ['water-11.086'],
  },
  {
    id: 'creek-boundary',
    ask: 'My property line is a creek or river, and the creek has moved.',
    short: `Water boundaries follow special Texas rules and can move with the bank. It takes a surveyor experienced in water boundaries and often a lawyer.`,
    more: `On navigable streams the state owns the bed and the boundary is set by the gradient boundary rule from Texas court decisions; on non-navigable ones the line usually runs to the center. Slow natural change moves the line; sudden change generally does not.`,
    surveyor: `${OWNER} can survey a water boundary; expect it to be a bigger job than a normal line.`,
    laws: [],
  },
  {
    id: 'mineral-rights',
    ask: 'Who owns the minerals under my land?',
    short: `That is a title question, not a survey question. Minerals are often severed from the surface by old deeds; a title company or oil-and-gas attorney can run it down.`,
    more: `A survey can locate a lease or pipeline easement on the ground, but it does not determine mineral ownership.`,
    surveyor: `${OWNER} can survey easements and well sites if the title work needs it.`,
    laws: [],
  },
  {
    id: 'hoa-restrictions',
    ask: 'Do I have to follow the HOA or deed restrictions?',
    short: `Recorded deed restrictions run with the land, so yes, they bind you whether or not you knew about them. They are in the county clerk’s records and usually referenced on the plat.`,
    more: `Restrictions can control fences, setbacks, outbuildings, and more, on top of the city rules.`,
    surveyor: `A survey shows the platted lines the restrictions refer to.`,
    laws: [],
  },
  {
    id: 'verify-license',
    ask: 'How do I know a surveyor is legitimate? Can I file a complaint?',
    short: `Look them up by name or license number at the Board’s site, pels dot texas dot gov. Only a Registered Professional Land Surveyor may practice or advertise as one in Texas.`,
    more: `The same Board takes complaints and disciplines surveyors. ${OWNER}’s license is RPLS number 6706.`,
    surveyor: `Check ours any time; ${OWNER} is glad to show his license and the Board’s listing.`,
    laws: ['occ-1071.251', 'occ-1071.002-6'],
  },
  {
    id: 'survey-validity',
    ask: 'How long is a survey good for?',
    short: `Legally it doesn’t expire. Practically, lenders and title companies want one less than six to twelve months old, and a new one is needed once anything on the property changes.`,
    more: `An old survey is still useful evidence of where the corners were; it just doesn’t show what has changed since.`,
    surveyor: `${OWNER} can update an existing survey, which is often less work than starting over.`,
    laws: [],
  },
  {
    id: 'what-survey-shows',
    ask: 'What does a survey actually show, and how accurate is it?',
    short: `A boundary survey shows the lines, corners, bearings and distances, and the pins set; an improvements survey adds the buildings, fences, driveways, easements and setbacks in relation to those lines.`,
    more: `Modern GPS and total-station work measures to a fraction of an inch; the harder part is the research that decides where the line legally is. A sketch or an appraisal-district map is not a survey and cannot be relied on for a line.`,
    surveyor: `Every Starr survey is sealed by the RPLS and reviewed before it goes out.`,
    laws: ['occ-1071.002-6', 'tac-138.83', 'tac-138.89'],
  },
  {
    id: 'boundary-line-agreement',
    ask: 'The neighbor and I want to agree to leave the fence where it is. How?',
    short: `A boundary line agreement: both owners sign a written agreement describing the agreed line, and it is recorded with the county clerk so it binds future owners.`,
    more: `Lenders on either property may need to consent. An attorney drafts it; the surveyor supplies the description and exhibit.`,
    surveyor: `${OWNER} surveys the agreed line, writes the legal description, and prepares the exhibit the agreement attaches.`,
    laws: [],
  },
  {
    id: 'go-to-court',
    ask: 'If we can’t agree, what does going to court look like?',
    short: `The Texas lawsuit that decides who owns land is called trespass to try title; a court can also declare where a boundary is. Both need a lawyer, and both rest on the survey evidence.`,
    more: `Expect the surveyor’s drawing, the deeds, and the surveyor’s testimony to be the heart of the case. Adverse-possession time limits can decide it before anything else does.`,
    surveyor: `${OWNER} can prepare a court-ready survey and exhibit and testify as an expert, which is a full-record job rather than a single-line retrace.`,
    laws: ['prop-22.001', 'cprc-16.021'],
  },
];

/** Compact block for the system prompt: the situation, the short answer, the longer one, what Starr does, and the law ids. */
export function situationsText(): string {
  return SITUATIONS.map((s) => `- ${s.ask}\n  SHORT: ${s.short}\n  MORE: ${s.more}\n  WHAT WE DO: ${s.surveyor}${s.laws.length ? `\n  LAW: ${s.laws.join(', ')}` : ''}`).join('\n');
}
