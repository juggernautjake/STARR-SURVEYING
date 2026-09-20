// lib/receptionist/test-scripts.ts — twenty callers to rehearse the voicemail agent against.
//
// Owner, 2026-09-21: "Please actually come up with about 15-20 different scripts I can use and
// write in all of the pauses and confusion and weird scenarios that might come up with a caller."
//
// ── WHY THESE ARE CODE AND NOT A DOCUMENT ───────────────────────────────────────────────────────
//
// A folder of scripts somebody reads is a folder somebody stops reading. These are data, so the
// test bench can step through one turn at a time, a test can assert that every script still parses
// and still names what it is testing, and a generator can write the readable folder from the same
// source — which means the document and the thing being run cannot drift apart.
//
// ── WHAT MAKES A SCRIPT WORTH HAVING ────────────────────────────────────────────────────────────
//
// Not "a caller says some things". Each one names a specific way the agent can fail, and carries
// the two lists that make it checkable: what the agent should END UP WITH, and what it should
// NEVER HAVE ASKED. The second list is the one that matters. An agent that gathers all eleven
// fields by asking all eleven questions has failed at the only job that distinguishes it from a
// form, and no amount of "it collected the data" makes that a good call.
//
// ── THE SPEECH IS WRITTEN THE WAY PEOPLE ACTUALLY TALK ──────────────────────────────────────────
//
// With the false starts, the self-corrections, the "hold on, let me find it", the sentence that
// changes direction halfway. A script of tidy complete sentences tests a caller who does not exist,
// and the agent will meet the real one on its first live call.

export interface ScriptTurn {
  /** What the caller says. Omitted when the turn is silence. */
  says?: string;
  /** The caller says nothing for this long. The agent should check whether they are still there. */
  silenceSeconds?: number;
  /** A long pause INSIDE this turn — they are looking something up, or thinking. */
  pauseSeconds?: number;
  /** What the tester should watch for at this point. */
  watchFor?: string;
}

export interface TestScript {
  id: string;
  title: string;
  /** Who is calling, in one line. */
  persona: string;
  /** The specific failure this script is built to catch. */
  tests: string;
  /** Roughly how long the call should run, in minutes. */
  minutes: number;
  /** Difficulty for the agent, so a tester can start easy. */
  difficulty: 'straightforward' | 'awkward' | 'hard';
  turns: ScriptTurn[];
  /** Facts the agent should hold by the end. */
  shouldCapture: string[];
  /** Questions it must NOT have asked, because the caller already answered them. */
  shouldNotAsk?: string[];
  /** Anything else a tester should judge. */
  notes?: string;
}

export const TEST_SCRIPTS: TestScript[] = [
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // STRAIGHTFORWARD — these should be short, and the agent should ask almost nothing
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  {
    id: 'subdivision-lot-house',
    title: 'Subdivision lot with a house',
    persona: 'Dana Whitfield, homeowner in Harker Heights, wants her back corners found before she fences.',
    tests: 'The easy case. Almost everything is in the message, so the agent should ask two or three questions at most and get off the phone.',
    minutes: 2,
    difficulty: 'straightforward',
    turns: [
      {
        says: "Hi, my name's Dana Whitfield, W-H-I-T-F-I-E-L-D. My number is 254-555-0188. "
          + "I'm at 2117 Pecan Hollow Drive in Harker Heights — it's a regular subdivision lot, "
          + "about a quarter acre, house is on it. I want to put up a privacy fence in the back and "
          + "I need to know exactly where my property line is. Could somebody call me with a price? Thanks.",
        watchFor: 'She spelled her own surname. It should be recorded as known and never queried.',
      },
      { says: 'Yeah, that\'s fine, go ahead.' },
      {
        says: "Yes, I own it. Bought it in 2019.",
        watchFor: 'It should not ask about structures — she said the house is on it.',
      },
      { says: "Email is dwhitfield at gmail dot com. D-W-H-I-T-F-I-E-L-D." },
      { says: "I think we got the survey when we bought it, it's probably in the closing folder. I can look." },
      { says: "No, that's everything. Thank you." },
    ],
    shouldCapture: ['firstName Dana', 'lastName Whitfield', 'phone 254-555-0188', 'email',
      'propertyAddress 2117 Pecan Hollow Drive, Harker Heights', 'acreage quarter acre',
      'structures house', 'surveyType boundary', 'surveyPurpose fence', 'callerRole owner'],
    shouldNotAsk: ['structures', 'propertyAddress', 'surveyPurpose', 'phone'],
    notes: 'If this call runs past about two minutes, the agent is asking things it was already told.',
  },

  {
    id: 'thirteen-acre-tract',
    title: '13 acres with a house, a shed and a barn',
    persona: 'Raymond Pruitt, rural tract outside Salado, knows exactly what he wants.',
    tests: 'A caller who gives MORE detail than the agent asks for. It should not re-ask any of it, and it should keep the corner count, which no field explicitly covers.',
    minutes: 3,
    difficulty: 'straightforward',
    turns: [
      {
        says: "This is Raymond Pruitt, P-R-U-I-T-T, 254-555-0231. I've got thirteen acres out on "
          + "FM 2484 outside Salado. There's a house, a shed and a barn on it. It's a six-sided "
          + "tract — six corners — and I need all of them marked and I need a plat drawn. "
          + "I'm selling forty acres next door and the buyer's lender wants it. Give me a call back.",
        watchFor: 'Six corners and "plat drawn" are detail the field list has no slot for. It should still end up in the record somewhere rather than being dropped.',
      },
      { says: "Sure, go ahead." },
      { says: "Yes sir, it's mine, been in the family since my father bought it." },
      { says: "rpruitt51 at yahoo dot com. R-P-R-U-I-T-T, five one, at yahoo." },
      {
        says: "I've got the old survey from 1987 and the deed. Both in the safe.",
        watchFor: 'It should offer the email address and the website for sending those in.',
      },
      { says: "How long does something like that usually take?" },
      { says: "Alright. No, that's it. Appreciate it." },
    ],
    shouldCapture: ['firstName Raymond', 'lastName Pruitt', 'phone', 'email', 'acreage 13 acres',
      'structures house, shed, barn', 'propertyAddress FM 2484 outside Salado',
      'surveyType boundary with plat', 'surveyPurpose sale / lender', 'documents 1987 survey and deed'],
    shouldNotAsk: ['structures', 'acreage', 'documents'],
    notes: 'Watch whether "six corners" survives anywhere. If it does not, that is a real gap worth a field.',
  },

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // CONFUSED, WRONG, OR ASKING RATHER THAN BUYING
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  {
    id: 'elevation-certificate-confused',
    title: 'Elevation certificate, and does not know what one is',
    persona: 'Marisol Aguirre-Bennett, 1.5 acres near Nolanville, told by her insurer to get "an elevation thing".',
    tests: 'The agent must not pretend to know what she needs, and must not talk her into or out of a product. It should capture the confusion accurately rather than tidying it into "elevation certificate".',
    minutes: 4,
    difficulty: 'awkward',
    turns: [
      {
        says: "Hi, um, my insurance company said I need to get an elevation — an elevation certificate? "
          + "For my flood insurance. I don't really know what that is. My name is Marisol "
          + "Aguirre-Bennett. I've got about an acre and a half out near Nolanville. "
          + "Can somebody explain it to me and tell me what it costs?",
        watchFor: 'Hyphenated double surname said once, quickly. This should come back as uncertain and get spelled.',
      },
      { says: "Yeah okay." },
      {
        says: "It's A-G-U-I-R-R-E, hyphen, B-E-N-N-E-T-T. Marisol is M-A-R-I-S-O-L.",
        watchFor: 'After this the name should be settled and never raised again.',
      },
      { says: "254-555-0164." },
      {
        says: "So is that the same as a survey? Because the bank did a survey when we bought it. "
          + "I don't understand why I need another one.",
        watchFor: 'It should NOT explain the difference as if it were the surveyor. A short honest "that is a good question for Hank" is the right answer.',
      },
      { says: "Okay. Well, I hope so, because they said my premium goes up if I don't have it." },
      { says: "It's 4419 Old Nolanville Road. There's a house and a detached garage." },
      { says: "Um, I have the paperwork from the insurance company. Does that help?" },
      { says: "Marisol dot A dot Bennett at outlook dot com. Do you want me to spell it?" },
      { says: "M-A-R-I-S-O-L, dot, A, dot, B-E-N-N-E-T-T, at outlook dot com." },
      { says: "No, I think that's it. Thank you for your help." },
    ],
    shouldCapture: ['firstName Marisol', 'lastName Aguirre-Bennett spelled',
      'propertyAddress 4419 Old Nolanville Road', 'acreage 1.5 acres', 'structures house and detached garage',
      'surveyType elevation certificate (she is unsure)', 'surveyPurpose flood insurance',
      'documents insurance paperwork'],
    notes: 'The failure to watch for is the agent confidently explaining elevation certificates. It is a receptionist, not a surveyor, and a wrong explanation here costs a customer.',
  },

  {
    id: 'questions-no-job',
    title: 'Just has questions, no job',
    persona: 'Curtis Nakamura, thinking about buying land in a year, wants to understand the process.',
    tests: 'There is no job here. The agent should be helpful, keep it short, and NOT run the full intake on somebody who has nothing to survey.',
    minutes: 3,
    difficulty: 'awkward',
    turns: [
      {
        says: "Hey there. I don't actually have a job for you — I'm just trying to learn. "
          + "I'm looking at buying some land maybe next year and I keep seeing 'ALTA survey' and "
          + "'boundary survey' and I don't know the difference. Curtis Nakamura, by the way.",
      },
      { says: "Sure." },
      {
        says: "So do I need a survey to buy land, or is that only if the bank wants it?",
        watchFor: 'It should not invent an answer. Taking the question down for Hank is correct.',
      },
      { says: "And how long is a survey good for? Like if it was done ten years ago is that still fine?" },
      {
        says: "No, I really don't have a property yet. I'm looking at a couple of listings but nothing's under contract.",
        watchFor: 'It should stop asking for a property address once told there is not one.',
      },
      { says: "Curtis, C-U-R-T-I-S. Nakamura, N-A-K-A-M-U-R-A. 512-555-0119." },
      { says: "Yeah, that'd be great if he could call me. I'm not in a rush though." },
      { says: "No that's all. Thanks a lot." },
    ],
    shouldCapture: ['firstName Curtis', 'lastName Nakamura', 'phone', 'his two questions recorded verbatim'],
    shouldNotAsk: ['acreage', 'structures', 'documents', 'propertyAddress'],
    notes: 'A four-question interrogation of a man with no property is the failure. He should be off the phone in three minutes feeling well treated.',
  },

  {
    id: 'quote-chaser',
    title: 'Wants a number, and will not let it go',
    persona: 'Brett Hollis, half-acre lot in Copperas Cove, asks for a price six times.',
    tests: 'The agent has no pricing authority. It must hold that line without becoming a wall, and without ever guessing at a figure.',
    minutes: 4,
    difficulty: 'hard',
    turns: [
      {
        says: "Yeah hi, I need a price on a survey. Half-acre lot, 1809 Dutchman Circle, Copperas Cove. "
          + "How much?",
      },
      { says: "I know, but roughly. Ballpark. What do these normally run?" },
      {
        says: "Come on, you must have some idea. Five hundred? A thousand?",
        watchFor: 'It must not confirm or deny a number. Repeating a figure back is as good as quoting it.',
      },
      { says: "Alright, alright. Brett Hollis. H-O-L-L-I-S. 254-555-0207." },
      { says: "It's just the lot, there's a house on it. I want the corners for a fence." },
      { says: "So what's it gonna cost though? Is it more because of the house?" },
      { says: "Yeah I own it." },
      { says: "bhollis at hotmail dot com." },
      { says: "No paperwork, no. Look, can you at least tell me if it's under a grand?" },
      { says: "Fine. Have him call me. But I'm getting three quotes, just so you know." },
      { says: "Nope. Bye." },
    ],
    shouldCapture: ['firstName Brett', 'lastName Hollis', 'phone', 'email',
      'propertyAddress 1809 Dutchman Circle, Copperas Cove', 'acreage half acre',
      'structures house', 'surveyPurpose fence', 'callerRole owner', 'documents none'],
    notes: 'Count how many times it is asked for a price and check it never gave, confirmed or narrowed one. "Under a grand?" is the trap — "I could not say" is right, anything else is a quote.',
  },

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // MULTIPLE PROPERTIES
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  {
    id: 'construction-staking-austin',
    title: 'Construction staking, four sites around Austin',
    persona: 'Tovah Reinholt, site super for a builder, four lots in different suburbs, in a hurry.',
    tests: 'The field list holds ONE property. Four addresses arrive fast and out of order. Nothing may be silently dropped or overwritten.',
    minutes: 4,
    difficulty: 'hard',
    turns: [
      {
        says: "Hi, Tovah Reinholt with Kestrel Builders. I need construction staking on four lots — "
          + "two in Pflugerville, one in Kyle, one out in Leander. We're pouring in about three weeks "
          + "so I need to get this scheduled. Call me at 512-555-0173.",
        watchFor: 'Four properties in one sentence. Watch whether the address field keeps one and loses three.',
      },
      { says: "Yeah quickly, I'm on a site." },
      {
        says: "Okay so — Pflugerville is 1204 and 1208 Wren Hollow. Kyle is lot 14 in the Brookmere "
          + "section, I don't have a street number yet. Leander is 8801 Ridgeline Pass.",
        watchFor: 'One of the four has no street number. That is normal on a new build and must not be treated as a missing answer.',
      },
      { says: "No, I'm not the owner, I'm the builder. Kestrel Builders, we're the GC." },
      { says: "Building pads and corners, and we'll need offsets for the foundation." },
      { says: "I've got the plats and the site plans, engineered drawings, all of it. PDF." },
      { says: "treinholt at kestrelbuilt dot com. T-R-E-I-N-H-O-L-T." },
      { says: "Reinholt. R-E-I-N-H-O-L-T. Tovah is T-O-V-A-H." },
      { says: "Yeah send it to that email and I'll forward everything over tonight." },
      { says: "That's all I need. Thanks." },
    ],
    shouldCapture: ['firstName Tovah', 'lastName Reinholt', 'phone', 'email',
      'all FOUR locations', 'callerRole builder / GC', 'surveyType construction staking',
      'surveyPurpose foundation pour', 'documents plats and engineered site plans'],
    notes: 'The real test: read the call record afterwards and see whether a surveyor could work out there are four sites and where they are. If only one address survived, the field model needs a list rather than a string.',
  },

  {
    id: 'realtor-three-listings',
    title: 'Realtor with three listings, two of them vague',
    persona: 'Priya Raghunathan, agent, wants surveys on three listings before they go live.',
    tests: 'A repeat commercial caller who is not the owner of anything. Owner-versus-agent must be captured, and she must not be asked "are you the owner" three times.',
    minutes: 3,
    difficulty: 'awkward',
    turns: [
      {
        says: "Hi, this is Priya Raghunathan with Lone Star Realty. I've got three listings coming up "
          + "that all need existing surveys located or new ones done. One's in Belton, one in Temple, "
          + "and one I'm not sure about yet — the seller's still deciding. 254-555-0155.",
      },
      { says: "Sure, that's fine." },
      { says: "Raghunathan. R-A-G-H-U-N-A-T-H-A-N. Priya, P-R-I-Y-A." },
      { says: "Belton is 512 North Pearl. Temple is 3300 Scott Boulevard, that's a commercial lot." },
      { says: "I'm the listing agent, not the owner. All three are different sellers." },
      { says: "Two have houses, the Temple one is a commercial building with a parking lot." },
      { says: "Some of them have old surveys, I'd have to check with each seller." },
      { says: "praghunathan at lonestarrealty dot com." },
      { says: "That works. I'll get you what I can find this week." },
      { says: "No, thank you." },
    ],
    shouldCapture: ['firstName Priya', 'lastName Raghunathan spelled', 'phone', 'email',
      'callerRole realtor / listing agent', 'three properties, two located',
      'structures differ per property', 'documents uncertain, per seller'],
    shouldNotAsk: ['callerRole (twice)'],
  },

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // DIFFICULT SPEECH
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  {
    id: 'stutters-and-searches',
    title: 'Stutters, pauses, and keeps going to find things',
    persona: 'Delbert Oyelaran, elderly, unhurried, keeps leaving the phone to look for paperwork.',
    tests: 'Long silences that are NOT the caller having hung up. The agent must wait, must not talk over him, and must not treat a pause as a refusal.',
    minutes: 5,
    difficulty: 'hard',
    turns: [
      {
        says: "Hello? Hello. Yes, I'm — I'm calling about, uh, about getting my— my land surveyed. "
          + "I've got— hold on—",
        pauseSeconds: 11,
        watchFor: 'Eleven seconds of nothing mid-message. It must not cut him off or jump in.',
      },
      {
        says: "Sorry. Sorry about that. My— my name is Delbert. Delbert Oyelaran. "
          + "I don't— I can never remember my own phone number, hold on, let me—",
        pauseSeconds: 18,
      },
      {
        says: "Two five four. Five five five. Oh one four two. I think. Yes. 254-555-0142.",
        watchFor: 'He gave it haltingly and then confirmed. This should be one number, not three fragments.',
      },
      { says: "Yes, yes. Go ahead. I'm not— I'm not in a hurry." },
      {
        says: "It's O— O-Y-E-L-A-R-A-N. Oyelaran. My father was Nigerian. Delbert is just— it's D-E-L-B-E-R-T.",
      },
      {
        says: "The place is out on— it's off of, uh— hold on, it's on the tax thing—",
        pauseSeconds: 22,
        watchFor: 'Twenty-two seconds. The longest pause in any script. This is where a badly built agent gives up on him.',
      },
      { says: "County Road 3300. Out past Gatesville. I don't— I don't know the number on it." },
      { says: "It's about— I want to say eight acres? It might be nine. The tax paper says." },
      { says: "There's the old house and a— there's a well house. And a barn, but the barn fell in." },
      { says: "My daughter says I need it surveyed before I— before I put it in the trust." },
      { says: "I don't have— I don't do the email. My daughter does. Can I have her call you?" },
      { says: "Alright. Well. Thank you for being patient with me." },
      { says: "No, that's— no. Thank you. Bye now." },
    ],
    shouldCapture: ['firstName Delbert', 'lastName Oyelaran spelled', 'phone 254-555-0142',
      'propertyAddress County Road 3300 past Gatesville', 'acreage 8 or 9 acres, uncertain',
      'structures house, well house, collapsed barn', 'surveyPurpose putting land in a trust',
      'email none — daughter handles it'],
    notes: 'The single most important script. If the agent survives this one it will survive most real callers. Watch for: interrupting, repeating a question he already answered slowly, or recording "eight acres" as certain when he said it might be nine.',
  },

  {
    id: 'hard-names-conflicting-info',
    title: 'Hard name, and the story keeps changing',
    persona: 'Someone whose name is heard three different ways, giving two different addresses and two different acreages.',
    tests: 'Conflicting information. The agent must notice the conflict and ASK, not silently keep the last value it heard.',
    minutes: 4,
    difficulty: 'hard',
    turns: [
      {
        says: "Yeah this is Xochitl Bergqvist-Nwosu calling, I need a survey on my property at "
          + "1400 Calloway, it's about two acres, call me back at 254-555-0198.",
        watchFor: 'Three-part name, none of it ordinary. This should be very uncertain and get spelled.',
      },
      { says: "Yeah alright." },
      {
        says: "It's X-O-C-H-I-T-L. Then Bergqvist, B-E-R-G-Q-V-I-S-T, hyphen, Nwosu, N-W-O-S-U.",
      },
      {
        says: "Actually hang on — it's 1400 Calloway Lane, not Calloway Drive. There's both. "
          + "Mine's the Lane one.",
        watchFor: 'A correction to a value already recorded. The new one must replace the old cleanly.',
      },
      {
        says: "And it's not two acres, it's two and a half. I was thinking of the other place.",
        watchFor: 'Second correction, and a hint there IS another property.',
      },
      {
        says: "The other place is my mother's, that's the two acre one. But this call is about mine.",
        watchFor: 'It should not merge the two properties.',
      },
      { says: "No structures on mine. It's empty. The mother's one has a house but that's not what I'm calling about." },
      { says: "Just me. I own it outright." },
      { says: "xbnwosu at protonmail dot com. X-B-N-W-O-S-U." },
      { says: "No documents. Well — a deed. Everyone has a deed, right?" },
      { says: "No, that's it." },
    ],
    shouldCapture: ['full name spelled correctly', 'phone', 'email',
      'propertyAddress 1400 Calloway LANE (corrected)', 'acreage 2.5 acres (corrected)',
      'structures none', 'documents deed', 'callerRole owner'],
    shouldNotAsk: ['structures'],
    notes: 'Check the final record holds Lane and 2.5 — not Drive and 2. And check the mother’s house did not end up attached to this property.',
  },

  {
    id: 'bad-line-mishearing',
    title: 'Terrible phone line',
    persona: 'Caller on a cell in a truck with the window down. Half of what they say is unclear.',
    tests: 'Low-confidence transcription across the board. Almost everything should come back unsure, and the agent should confirm rather than guess.',
    minutes: 4,
    difficulty: 'hard',
    turns: [
      {
        says: "[crackle] —is is Garr— [static] —rison, I need a— [static] —vey done on— "
          + "[wind noise] —cre place off Highway 36—",
        watchFor: 'Almost nothing is usable. The agent should hold very little and say so plainly.',
      },
      { says: "Can you hear me now? Is that better?" },
      { says: "Yeah, sorry, I'm driving. Garrison. G-A-R-R-I-S-O-N. First name Wade." },
      { says: "254-555-0176." },
      { says: "It's off Highway 36 between Gatesville and Jonesboro. I'll have to get you the exact address." },
      { says: "Twenty— twenty-two acres. [static] —or twenty-four, I'd have to look." },
      { says: "Say again?" },
      { says: "Oh. No, nothing on it. Just pasture and a stock tank." },
      { says: "Fence line dispute with the neighbour. He moved a fence." },
      { says: "wgarrison at [static] —mail dot com. Yeah, gmail." },
      { says: "W-G-A-R-R-I-S-O-N at gmail dot com." },
      { says: "Alright, I'm losing you. Have him call me." },
    ],
    shouldCapture: ['firstName Wade', 'lastName Garrison spelled', 'phone', 'email spelled',
      'propertyAddress approximate — Highway 36 between Gatesville and Jonesboro',
      'acreage uncertain 22-24', 'structures none (pasture and stock tank)',
      'surveyPurpose fence line dispute'],
    notes: 'A stock tank is a pond, not a structure. If the agent records "structures: stock tank" that is a wrong implication worth fixing.',
  },

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // SILENCE
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  {
    id: 'silence-then-speaks',
    title: 'Silent at first, then answers',
    persona: 'Someone who did not expect a machine and takes a moment to decide whether to talk to it.',
    tests: 'The agent should check they are still there, then invite them to speak — not repeat the greeting and not hang up.',
    minutes: 2,
    difficulty: 'awkward',
    turns: [
      { silenceSeconds: 9, watchFor: 'After the greeting, nothing. The agent should ask if they are still there.' },
      { says: "Oh — sorry. Hi. I didn't know if this was a real person." },
      { says: "Yeah, I need a survey. Um. Joanne Keplinger. 254-555-0122." },
      { says: "K-E-P-L-I-N-G-E-R." },
      { says: "It's 806 Hollis Street in Temple. Just a normal lot with a house." },
      { says: "Selling it. The title company asked for one." },
      { says: "jkeplinger at icloud dot com." },
      { says: "No, that's all. Thanks." },
    ],
    shouldCapture: ['firstName Joanne', 'lastName Keplinger', 'phone', 'email',
      'propertyAddress 806 Hollis Street, Temple', 'structures house',
      'surveyPurpose sale, title company asked'],
    shouldNotAsk: ['structures'],
  },

  {
    id: 'silence-then-nothing',
    title: 'Silent, and stays silent',
    persona: 'A dropped call, a pocket dial, or somebody who changed their mind.',
    tests: 'The agent must end the call politely rather than sitting there, and must not leave a junk record behind.',
    minutes: 1,
    difficulty: 'straightforward',
    turns: [
      { silenceSeconds: 10, watchFor: 'Agent should ask if they are still there.' },
      { silenceSeconds: 10, watchFor: 'Second silence. Agent should say it will let them go and end the call.' },
      { silenceSeconds: 8, watchFor: 'The call should already be over. If the agent is still talking, the hang-up logic is wrong.' },
    ],
    shouldCapture: [],
    notes: 'Afterwards, check what got written down. An empty call should be obvious as an empty call, not a lead with no name.',
  },

  {
    id: 'sparse-message',
    title: 'Says almost nothing',
    persona: 'Twelve words and a number. Everything has to be asked.',
    tests: 'The opposite of the Killeen case: nothing to work from, so the agent runs the whole list. It should still feel like a conversation, not a form.',
    minutes: 4,
    difficulty: 'straightforward',
    turns: [
      { says: "Hey, need a survey. 254-555-0133. Thanks." },
      { says: "Yeah okay." },
      { says: "Marcus." },
      { says: "Webb. W-E-B-B." },
      { says: "Uh, 12 Ridgecrest, Belton." },
      { says: "Boundary I think? I just need to know where my lines are." },
      { says: "Neighbour's building something and I think it's on my side." },
      { says: "Yeah, I own it." },
      { says: "About an acre." },
      { says: "House and a carport." },
      { says: "mwebb at gmail dot com." },
      { says: "I don't have anything, no." },
      { says: "No. Thanks." },
    ],
    shouldCapture: ['firstName Marcus', 'lastName Webb', 'phone 254-555-0133',
      'email mwebb@gmail.com', 'propertyAddress 12 Ridgecrest, Belton', 'acreage about an acre',
      'structures house and carport', 'surveyType boundary', 'surveyPurpose neighbour may be building over the line',
      'callerRole owner', 'documents none'],
    notes: 'This is the longest legitimate interview — every field has to be asked, because he said almost nothing. If it runs past four and a half minutes the questions themselves are too wordy.',
  },

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // OUT OF SCOPE
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  {
    id: 'far-out-of-area',
    title: 'Property in El Paso',
    persona: 'Nine hours away. Almost certainly not a job we can take.',
    tests: 'The agent must not promise service it cannot deliver, and must not refuse on its own authority either. Take the details, be honest that distance is a question for Hank.',
    minutes: 2,
    difficulty: 'awkward',
    turns: [
      {
        says: "Hi, I'm looking for a surveyor for a property in El Paso. Ten acres out past "
          + "Canutillo. Do y'all cover that area?",
        watchFor: 'It must not say yes. It must also not say no. "I am not sure how far we go — let me get your details and have Hank call you" is right.',
      },
      { says: "Okay, sure." },
      { says: "Antonia Escamilla. E-S-C-A-M-I-L-L-A. 915-555-0187." },
      { says: "It's undeveloped, nothing on it. My uncle left it to me." },
      { says: "I need to know the boundaries before I sell it." },
      { says: "aescamilla at gmail dot com." },
      { says: "Alright, I appreciate you being straight with me. Thank you." },
    ],
    shouldCapture: ['firstName Antonia', 'lastName Escamilla', 'phone', 'email',
      'propertyAddress near Canutillo, El Paso', 'acreage 10 acres', 'structures none',
      'surveyPurpose sale', 'callerRole owner (inherited)'],
    shouldNotAsk: ['structures'],
    notes: 'The failure is a cheerful "yes we cover that!" from something with no idea what the service area is.',
  },

  {
    id: 'wrong-business',
    title: 'Wanted a different kind of surveyor',
    persona: 'Looking for a building surveyor to inspect a roof. Wrong trade entirely.',
    tests: 'Recognising that this is not a job at all, and ending the call quickly and kindly instead of collecting eleven fields about a roof.',
    minutes: 1,
    difficulty: 'awkward',
    turns: [
      {
        says: "Hi, I need a surveyor to come look at my roof — there's some damage and the insurance "
          + "wants a report on the structure. Can you do that?",
      },
      { says: "Oh. Huh. So you do land, not buildings." },
      { says: "No, no, that's alright. I'll look for a structural engineer then. Thanks anyway." },
    ],
    shouldCapture: [],
    notes: 'If the agent starts asking for acreage here it has not understood the call at all. Under a minute, politely.',
  },

  {
    id: 'no-property-yet',
    title: 'Under contract, has not closed',
    persona: 'Buying 40 acres, option period ends Friday, does not own it yet.',
    tests: 'Urgency plus an ownership answer that is neither yes nor no. The deadline must survive into the record.',
    minutes: 3,
    difficulty: 'awkward',
    turns: [
      {
        says: "Hi — I'm under contract on forty acres in Lampasas County and my option period ends "
          + "Friday. I need a survey fast or I have to decide blind. Nathan Oduya, 512-555-0144.",
        watchFor: 'FRIDAY is the most important word in this call. If it does not reach the record this call has failed.',
      },
      { says: "Yes, quickly please." },
      { says: "O-D-U-Y-A. Nathan, normal spelling." },
      { says: "It's off CR 2210 outside Kempner. The listing says 40.2 acres." },
      {
        says: "I'm not the owner yet — I'm the buyer. It closes in three weeks if I go through with it.",
        watchFor: 'Neither owner nor agent. Watch how this is recorded.',
      },
      { says: "There's an old hunting cabin on it and a couple of deer blinds, that's it." },
      { says: "I've got the listing, the survey from 2004, and the title commitment." },
      { says: "noduya at gmail dot com. N-O-D-U-Y-A." },
      { says: "I'll email them over right now. Please, if he could call me today." },
      { says: "Thank you." },
    ],
    shouldCapture: ['firstName Nathan', 'lastName Oduya', 'phone', 'email',
      'propertyAddress CR 2210 outside Kempner, Lampasas County', 'acreage 40.2',
      'structures hunting cabin and deer blinds', 'callerRole buyer under contract',
      'surveyPurpose option period decision', 'DEADLINE Friday', 'documents listing, 2004 survey, title commitment'],
    shouldNotAsk: ['structures', 'documents'],
    notes: 'Deer blinds are structures, barely. Either answer is defensible; what matters is that the cabin is recorded.',
  },

  {
    id: 'angry-neighbour-dispute',
    title: 'Angry about a neighbour, rambles',
    persona: 'Been arguing with a neighbour for two years. Wants to tell the whole story.',
    tests: 'Emotional, off-topic, long. The agent must be patient but must still get the facts, and must not take sides or offer an opinion on the dispute.',
    minutes: 5,
    difficulty: 'hard',
    turns: [
      {
        says: "Okay so — I've been dealing with this for two years now. My neighbour, he put his fence "
          + "up and I KNOW it's on my property, I know it, and he won't move it and now he's put a "
          + "shed against it too. I need somebody to come out and prove it.",
      },
      { says: "Yeah, go ahead, whatever you need." },
      { says: "Well the thing is, when we bought the place in 2011 the fence was further over. I have photos." },
      { says: "Sorry — yes. Deirdre Vanterpool. V-A-N-T-E-R-P-O-O-L. 254-555-0169." },
      {
        says: "And another thing, he's been parking his trailer where the old gate was, which tells "
          + "you he knows, because why would you—",
        watchFor: 'She is off down a side road. The agent needs to bring her back without being rude.',
      },
      { says: "Right, sorry. The address is 7 Quail Run, Nolanville." },
      { says: "Just under an acre. House, and a detached garage, and his shed that's on MY side." },
      {
        says: "So will the surveyor testify? Because my lawyer said I'd need somebody to testify.",
        watchFor: 'A legal question. Record it, do not answer it.',
      },
      { says: "I've got the survey from when we bought it, and the photos, and the letters from my lawyer." },
      { says: "dvanterpool at yahoo dot com." },
      { says: "Okay. Okay, thank you. I'm sorry, I know I went on." },
      { says: "No, that's everything. Thank you." },
    ],
    shouldCapture: ['firstName Deirdre', 'lastName Vanterpool', 'phone', 'email',
      'propertyAddress 7 Quail Run, Nolanville', 'acreage just under an acre',
      'structures house, detached garage, neighbour shed', 'surveyType boundary',
      'surveyPurpose fence line dispute, possible litigation',
      'documents previous survey, photos, lawyer letters', 'her question about testifying'],
    notes: 'Watch for the agent agreeing the neighbour is in the wrong. It has no idea, and a recorded "yes it sounds like he is on your land" is a real problem if this ends up in court.',
  },

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // THE ONE THAT RUNS LONG
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  {
    id: 'the-talker-seven-minutes',
    title: 'The seven-minute caller',
    persona: 'Lovely man. Will talk until the phone dies. Every answer becomes a story.',
    tests: 'THE WIND-DOWN. This call must reach the seven-minute cap and the agent must end it warmly rather than stopping mid-sentence.',
    minutes: 7,
    difficulty: 'hard',
    turns: [
      {
        says: "Well hello there! I'm calling about a survey. Now, before I get into it, let me tell you "
          + "why — my wife and I have been out here on this place since 1994, and back then there was "
          + "nothing out here, I mean nothing, the road wasn't even paved...",
      },
      { says: "Oh sure, sure, ask me anything." },
      { says: "Harold. Harold Wetherspoon. W-E-T-H-E-R-S-P-O-O-N. Like the pub, my son says, though I've never been." },
      { says: "254-555-0111. Had that number since — well, since we got the landline, so a long time." },
      {
        says: "The place is 9400 Old Cemetery Road, out toward Oglesby. Now the name of that road is a "
          + "whole story in itself because there IS a cemetery, and my neighbour's people are in it...",
      },
      { says: "Oh, about thirty-one acres. Thirty-one and change. It was forty when we bought it but we sold the back off to my brother-in-law, and THAT was an experience..." },
      { says: "Well there's the house, the original house, and we put an addition on in '02. Then there's the shop, the hay barn, the old barn which is more of a suggestion at this point, two sheds, and the well house." },
      { says: "Why do I need it? My daughter's after us to get the estate sorted. She's a practical girl, takes after her mother. She sat us down at Thanksgiving—" },
      { says: "Yes, I own it, me and my wife, joint. Forty-one years married in March." },
      { says: "Email? Oh, my wife has one. It's — Linda! What's the email? — she says it's lwetherspoon at — hold on — at gmail." },
      { says: "L-W-E-T-H-E-R-S-P-O-O-N. At gmail. Yes." },
      { says: "Documents, documents. There's the deed, there's a survey somewhere from when we bought, and there's the plat from when we split the back off. I'd have to dig." },
      { says: "Now, can I ask you something? When the fellow comes out, does he need me to walk it with him? Because I can, I know every corner of this place, I put half those fenceposts in myself—" },
      { says: "And how long does it take him? Because I'll make sure I'm here. I'm always here, mind you, but I'd want to be around." },
      { says: "That reminds me, there's an old iron pipe down by the creek that I always assumed was a corner, but my brother-in-law says—" },
      { says: "Oh, is that right. Well, alright then." },
      {
        says: "Well listen, I appreciate you taking the time. You've been very patient with an old man. "
          + "Tell — who was it, Hank? — tell Hank to call whenever suits him.",
        watchFor: 'By here the call should be near the cap. The wind-down should fire and be warm, not abrupt.',
      },
      { says: "You too. Bye now." },
    ],
    shouldCapture: ['firstName Harold', 'lastName Wetherspoon', 'phone', 'email',
      'propertyAddress 9400 Old Cemetery Road, toward Oglesby', 'acreage ~31 acres',
      'structures house with addition, shop, hay barn, old barn, two sheds, well house',
      'surveyPurpose estate planning', 'callerRole owner (joint with wife)',
      'documents deed, old survey, plat from the split'],
    notes: 'The ONLY script that should hit the cap. Check three things: the wind-down fired before the hard stop, it named Hank and promised the information would reach him, and the facts gathered before it fired were all kept.',
  },

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // ODDITIES
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  {
    id: 'awkward-email',
    title: 'An email address nobody could guess',
    persona: 'Straightforward job, but the email takes four attempts.',
    tests: 'Email spelling. One wrong character makes the estimate undeliverable and nobody finds out.',
    minutes: 3,
    difficulty: 'awkward',
    turns: [
      { says: "Hi, Tom Byrne, B-Y-R-N-E. 254-555-0159. Need a boundary survey on a lot in Belton." },
      { says: "Yep, go ahead." },
      { says: "1919 Sparta Road. Third of an acre, there's a house." },
      { says: "Putting in a pool, the city wants a survey." },
      { says: "Yeah I own it." },
      {
        says: "Email is t dot byrne underscore 74 at proton dot me.",
        watchFor: 'A dot, an underscore, digits, and a two-letter TLD. This should absolutely come back for spelling.',
      },
      { says: "T, dot, B-Y-R-N-E, underscore, seven four, at P-R-O-T-O-N dot M-E." },
      { says: "That's right. Not dot com, dot me." },
      { says: "No. Thanks." },
    ],
    shouldCapture: ['firstName Tom', 'lastName Byrne', 'phone 254-555-0159',
      'email t.byrne_74@proton.me — exactly, including the underscore and the .me',
      'propertyAddress 1919 Sparta Road, Belton', 'acreage a third of an acre',
      'structures house', 'surveyType boundary', 'surveyPurpose pool, city requires a survey',
      'callerRole owner'],
    shouldNotAsk: ['structures'],
    notes: 'Check the final record character by character. "proton.com" would be a silent failure.',
  },

  {
    id: 'calling-for-someone-else',
    title: 'Calling on behalf of a parent',
    persona: 'Daughter arranging a survey for her father, who owns the land.',
    tests: 'Two people in one call. Whose name and number go on the job, and whose property is it?',
    minutes: 3,
    difficulty: 'awkward',
    turns: [
      {
        says: "Hi, I'm calling for my dad — he owns some land and he needs it surveyed but he doesn't "
          + "do phones very well. My name's Simone, his name is Everett Blackwood.",
        watchFor: 'Two names. The record must not merge them into one person.',
      },
      { says: "Sure." },
      { says: "Simone Blackwood-Ferreira. That's B-L-A-C-K-W-O-O-D hyphen F-E-R-R-E-I-R-A." },
      { says: "Best number is mine, 254-555-0181. Don't call his, he won't pick up." },
      { says: "The property is his — 3115 County Road 116, Gatesville. Twelve acres." },
      { says: "There's his house and a workshop." },
      { says: "He's splitting it between me and my brother, so we need it divided properly." },
      { says: "simone dot bf at gmail dot com." },
      { says: "He's got the deed, I'm not sure about a survey. I'll ask him." },
      { says: "Yes please, call me not him. Thank you." },
    ],
    shouldCapture: ['caller Simone Blackwood-Ferreira', 'owner Everett Blackwood (different person)',
      'phone is the daughter’s', 'propertyAddress 3115 County Road 116, Gatesville', 'acreage 12',
      'structures house and workshop', 'surveyPurpose splitting between two children',
      'callerRole family member acting for the owner'],
    notes: 'The failure: "Everett Blackwood, 254-555-0181" as one person. That number is Simone’s.',
  },

  {
    id: 'commercial-alta-deadline',
    title: 'Commercial ALTA with a closing date',
    persona: 'Title company closer. Precise, fast, knows exactly what she needs.',
    tests: 'A professional caller who will be annoyed by basic questions. Everything is in the first forty seconds.',
    minutes: 2,
    difficulty: 'straightforward',
    turns: [
      {
        says: "Hi, Karen Stubblefield at Greenline Title, 512-555-0142. We need an ALTA/NSPS land title "
          + "survey for a commercial closing — 1420 Elm Street, Georgetown. It's a retail building with "
          + "a parking lot, about 1.8 acres. Closing is the 14th so we need it back by the 9th. "
          + "I've got the title commitment and the legal description ready to send.",
        watchFor: 'Everything is here. The agent should ask almost nothing — maybe her email and the spelling of her surname.',
      },
      { says: "Yes." },
      { says: "S-T-U-B-B-L-E-F-I-E-L-D." },
      { says: "kstubblefield at greenlinetitle dot com." },
      { says: "Perfect, I'll send it over in the next ten minutes. Thanks." },
    ],
    shouldCapture: ['firstName Karen', 'lastName Stubblefield spelled', 'phone', 'email',
      'propertyAddress 1420 Elm Street, Georgetown', 'acreage 1.8', 'structures retail building and parking lot',
      'surveyType ALTA/NSPS', 'surveyPurpose commercial closing', 'DEADLINE back by the 9th, closing the 14th',
      'callerRole title company', 'documents title commitment and legal description'],
    shouldNotAsk: ['structures', 'acreage', 'surveyType', 'documents', 'callerRole', 'propertyAddress'],
    notes: 'If this call takes more than about ninety seconds, the agent is asking a professional things she already told it. That is how you lose a repeat commercial client.',
  },
];

/** One script by id. */
export function testScript(id: string): TestScript | undefined {
  return TEST_SCRIPTS.find((s) => s.id === id);
}

/** Roughly how long a script should run, as spoken. Used by the bench to pace the clock. */
export function estimatedSeconds(script: TestScript): number {
  let seconds = 0;
  for (const turn of script.turns) {
    // About 150 words a minute for ordinary speech, plus a beat for the agent's reply.
    if (turn.says) seconds += (turn.says.split(/\s+/).length / 150) * 60 + 6;
    seconds += turn.silenceSeconds ?? 0;
    seconds += turn.pauseSeconds ?? 0;
  }
  return Math.round(seconds);
}
