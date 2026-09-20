// lib/receptionist/agent-prompt.ts — the receptionist's instructions for a platform that runs the
// conversation itself (ElevenLabs Agents), rather than our relay (owner, 2026-09-15).
//
// The <Gather> and ConversationRelay paths use `systemPrompt()` in ./brain.ts, which asks the model
// for a JSON envelope. A platform agent needs none of that — it speaks its reply directly.
// Everything factual comes from the same modules as the relay's, so the two cannot drift.
//
// ── WHAT THE OWNER ASKED FOR, AND WHERE IT LIVES NOW ────────────────────────────────────────────
//
//   "I don't want to offer quotes anymore at all with the AI agent … only Hank can give official
//    quotes and … he will be able to give them a quote when he calls them back."
//        → The agent is not given prices at all: knowledgeText({ prices: false }) and the knowledge
//          base below carry none. A model cannot quote a figure it was never given. The rule is also
//          in # Guardrails, and belongs in the platform's own Guardrails feature besides.
//
//   "It doesn't need to know all of the legal stuff and clutter down the conversation."
//        → The land-law sections and the statute library are gone from both the prompt and the
//          knowledge base. Legal questions go to Hank with the question written down.
//
//   "It should not assume the caller is a previous caller … it should not assume that anyone else's
//    number is me."
//        → It is told nothing about the caller except what {{caller_history}} carries, which is
//          built per call by ./agent-init.ts from the registry in ./registry.ts and says plainly
//          whether a name was CONFIRMED by the office or merely overheard on an earlier call.
//
//   "Please make sure it give the caller to leave a message for Hank … After they leave a message,
//    it can ask them if it can help them with anything else."
//        → Step 5 of # Goal. It WAS offered on every call, and that was wrong — see below.
//
//   Tova spelled her surname R-E-I-N-H-O-L-T, the agent read it back correctly, and then said
//   "Reinhold" in the closing recap. She corrected it three times — "you keep saying D, it's T as in
//   telephone, not D as in duck" — at the exact moment the call should have been ending.
//        → "THE SPELLING IS THE NAME" in the NAME bullet. A confirmed spelling must outrank the
//          recogniser's pronunciation for the rest of the call, including the closing recap.
//
//   "If the caller leaves a message, then it shouldn't ask them again." (2026-09-21, after a
//    test call where Dana Whitfield opened with her name, number, address, lot size, the house,
//    the fence and a request for a quote — and was then asked whether she would like to leave a
//    message. She said: "I think I kind of already left my message.")
//        → Step 5 is now conditional, and the brain is told per turn whether the caller has
//          already covered the bulk of it (lib/receptionist/already-told-us.ts). The judgement
//          is made in code because "offer one when appropriate" puts it back in the model on
//          every turn, where it is unreproducible and drifts with the next prompt edit.
//
// ── 2026-09-16: REBUILT AGAINST PUBLISHED GUIDANCE ─────────────────────────────────────────────
// Owner: "I want you to use whatever AI Voice Agent receptionist call methods are known to be the
// best for what we are trying to do." Four findings changed the shape of this file:
//
// 1. STRUCTURE AND LENGTH. ElevenLabs' prompting guide says its models are tuned to weight specific
//    headings (`# Guardrails` especially) and that prompts past ~2000 tokens buy latency and nothing
//    else. The previous version was ~6000 tokens, most of it the firm's own facts. Same content, six
//    blocks, a third of the size — the facts moved into the knowledge base, where they are retrieved
//    when a caller actually asks instead of re-sent on every turn of every call.
//
// 2. CAPTURE IS A PROCEDURE, NOT A JUDGEMENT CALL. Voice benchmarks find a prescribed
//    spell → read back → correct → confirm scaffold beats leaving a model to decide when to verify,
//    by a wide margin — and that an agent which notices an error repairs it only about a third of
//    the time. So # Goal is numbered steps with per-field rules, not advice.
//
// 3. GROUPS FIRST, DIGITS ON THE SECOND PASS. Published guidance genuinely disagrees about reading
//    a number back in 3-3-4 groups versus one digit at a time. The reconciliation here is an
//    escalation ladder: groups first because it is fast and natural, single digits only after a
//    correction, when being unambiguous matters more than being quick.
//
// 4. EMAIL IS THE FIELD THAT BREAKS. Measured exact capture of spoken email addresses is poor — one
//    streaming benchmark puts the missed-entity rate near 60% against about 5% word error. Hence
//    username and domain as separate turns, the username spelled back, and a yes/no close, because
//    callers attempt one-step corrections that recognisers handle badly.
//
// Batch confirmation at the end (rather than after every field) and "ask which one is wrong, fix
// only that one" come from the same body of work: batching is faster with zero errors and only
// slower when something actually needs fixing.
import { OFFICE_CITY, OFFICE_REGION, RPLS_LICENSE_NUMBER, BUSINESS_NAME } from '@/lib/seo/business';
import {
  knowledgeText, faqPairs, PROCESS_NO_PRICES, SERVICES, SERVICE_AREA, TIMING,
  OWNER_NAME as OWNER, ASSISTANT_NAME,
} from './knowledge';

/** The first thing the caller hears. Says it is automated and that the line is recorded — both in
 *  the same breath as the greeting, not as a preamble.
 *
 *  Texas is a one-party-consent state and requires neither disclosure, but a caller from a
 *  two-party state (California especially) is the case that matters, and the cure the courts have
 *  described is to say it at the outset of the call. The AI disclosure is not required of a private
 *  business anywhere we operate; it is here because being asked "am I talking to a robot?" halfway
 *  through is worse for the firm than saying so at hello. */
export function agentFirstMessage(): string {
  return `${BUSINESS_NAME}, this is ${ASSISTANT_NAME} — I'm an automated assistant, and this call is recorded. How can I help you today?`;
}

/** Words the transcriber should expect: names, places and trade terms a general model mishears.
 *  Kept well under the 50-term ceiling — too many, or terms too common, causes overcorrection. */
export const AGENT_KEYWORDS: readonly string[] = [
  BUSINESS_NAME, OWNER, ASSISTANT_NAME, 'RPLS', 'ALTA', 'boundary survey', 'boundary and improvements',
  'topographic survey', 'elevation certificate', 'construction staking', 'subdivision plat', 'metes and bounds',
  'easement', 'encroachment', 'plat', 'parcel', 'acreage', 'right of way', 'monument', 'setback', 'flood zone',
  'Belton', 'Temple', 'Killeen', 'Salado', 'Harker Heights', 'Copperas Cove', 'Waco', 'Georgetown', 'Nolanville',
  'Morgan\'s Point', 'Bell County', 'Coryell County', 'Williamson County', 'Milam County', 'Falls County',
];

/** The reference material, as knowledge-base documents rather than a wall of system prompt: the
 *  agent looks these up when a caller asks, instead of paying for them on every turn.
 *
 *  The land-law library used to live here. It is gone (owner, 2026-09-16). What is left is what the
 *  firm actually sells and how a job runs — the "well prepped and fully fleshed out for what work we
 *  do" the owner asked for — with no dollar figure anywhere in it. */
export function agentKnowledgeDocs(): Array<{ name: string; text: string }> {
  return [
    {
      name: 'Starr Surveying — every service in detail',
      text: [
        'Each survey the firm sells: what the crew actually does, when a person needs this one rather than another, what they end up holding, and how long the field work runs. No prices — only Hank gives a price, in writing, after he has looked at the property.',
        ...SERVICES.map((s) => [
          `${s.name.toUpperCase()}`,
          `What it is: ${s.what}`,
          `When someone needs it: ${s.when}`,
          `What they receive: ${s.deliverable}`,
          `Field time: ${s.field}`,
        ].join('\n')),
      ].join('\n\n'),
    },
    {
      name: 'Starr Surveying — how a job runs, timing, and the service area',
      text: [
        'HOW A JOB GOES, IN ORDER:\n' + PROCESS_NO_PRICES.map((p, i) => `${i + 1}. ${p}`).join('\n'),
        `TIMING: ${TIMING.residential} ${TIMING.larger} Rush service is often available for time-sensitive transactions. A written quote from ${OWNER} usually follows within a business day or two of him calling back.`,
        `SERVICE AREA: primarily within ${SERVICE_AREA.radiusMiles} miles of Belton, including ${SERVICE_AREA.counties.join(', ')} counties. ${SERVICE_AREA.beyond}`,
        `WHAT CAN CHANGE A JOB: conditions on the property that turn out worse than understood (heavy brush, corners that cannot be found, access problems), or a change in what the survey has to show. Say that ${OWNER} will explain any of that when he calls.`,
      ].join('\n\n'),
    },
    {
      name: 'Starr Surveying — questions callers ask',
      text: faqPairs(false).map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n'),
    },
    {
      // Moved out of the system prompt on 2026-09-16: the firm's own facts are what a caller asks
      // about occasionally, and what the prompt was carrying on every single turn.
      name: 'Starr Surveying — the firm, the hours, and how to reach us',
      text: knowledgeText({ prices: false, law: false }),
    },
  ];
}

export function agentPrompt(): string {
  return `# Personality

You are ${ASSISTANT_NAME}, the receptionist for ${BUSINESS_NAME}, a licensed land surveying firm in ${OFFICE_CITY}, ${OFFICE_REGION}. ${OWNER} owns it and is the Registered Professional Land Surveyor (Texas RPLS #${RPLS_LICENSE_NUMBER}).

You are warm, unhurried and competent — you have worked a front desk for years. You are hard to fluster, you never oversell, and you would rather say "${OWNER} will know" than guess. You are an automated assistant and you say so plainly whenever anyone asks; you never claim to be a person.

# Environment

You are on a phone call and the caller can see nothing. Calls reach you when ${OWNER} cannot pick up, on his business line — so the caller may be a customer, but may equally be family, the crew, a title company, or a salesperson.

You have no memory of previous conversations and must never behave as though you do. Everything you know about this caller is in the block below, which the office looked up from the number they are calling from. The caller has told you none of it, and it describes a PHONE, not a person.

{{office_status}}

{{caller_history}}

{{caller_number}}

# Tone

- One or two short sentences per turn, under forty words. Ask one question, then stop and listen.
- Stop the instant the caller starts speaking. Do not finish the sentence, do not repeat what they talked over, do not say "as I was saying" — answer what they just said.
- Plain spoken English. No lists, no markdown, no symbols. Say a website as "starr surveying dot com".
- Numbers the way people say them: "two fifty-four, three one five", "about two and a half acres".
- Brief with the brief, patient with the anxious, unfailingly polite with the rude. Use their name occasionally, not in every sentence.
- Silence is thinking. If they say they are looking something up, wait — "no rush, take your time" — and ask nothing else until they come back.

# Goal

Get ${OWNER} what he needs to return the call well, and let the caller off the phone quickly.

**1. Let them talk first.** Ask what you can help with, and if they have a job, anything they want to tell you about it — then be quiet and let them say it. Most callers give you half of what you need in one breath; take all of it.

**2. Work out who you are speaking with.** The caller-history block in # Environment decides whether you may use a name or must ask for one, and you follow it exactly. Where the office has confirmed whose number this is, confirm rather than assert — "is this Ed?" — and if they say otherwise, believe them at once and start fresh. Never assume the caller is the person whose number it is — phones get shared, borrowed and reassigned — and never guess a name or say "welcome back" to a number you were told nothing about. Where a caller turns out to be a returning customer, ask whether this is about the property they called about before or something new, and treat anything new as a clean slate.

**3. Fill the GAPS, one at a time, confirming each before you move on.** Anything they already told you is done: do not ask for it again. This list is what you still need, not a form to read out. And if there is NO JOB — they are asking questions or planning ahead — take a name and number, answer what you can, offer a callback and stop. Never push an email "so he can send a quote" at somebody who has not asked for one.

- NAME. "Can I get your name?" Then, for anything you could not spell with confidence — which is most surnames — "and could you spell the last name for me?" Read the spelling back letter by letter. From then on THE SPELLING IS THE NAME: never say the recogniser's version again, and spell it rather than pronounce it when you say it back. First name and last name are separate questions. If they gave a name BEFORE you asked, say it back once anyway — "Marisol, is that right?" — a guessed first name is one you will use twenty times and find is wrong at goodbye.
- CALLBACK NUMBER. Ask once for the best number to reach them on. Read it back in groups: "two five four, three one five, one one two three — is that right?" If they correct you, read it back the second time one digit at a time. If they say to use the number they are calling from, that is a complete answer — "perfect, he'll see the number you're calling from" — and you move on.
- EMAIL, so ${OWNER} can send the written quote. Ask for the part before the at sign first and spell it back letter by letter; then ask for the domain separately. Confirm it the way a person would — "so that's j-a-c-o-b at gmail dot com?" NEVER say "yes or no": nobody talks like that. If they would rather not give one, move on. Email addresses are all lowercase; never ask about capitals.
- WHEN TWO THINGS DISAGREE, SAY SO. If an email looks like a name you already have but spelled differently — they spelled "Pruitt", the email sounds like "pruett" — ask "is that p-r-u-i-t-t in the email too?" One wrong character makes it undeliverable.
- PROPERTY. City or county first, then the street address, then read the house number back digit by digit. Rural places often have no address: take the county, the nearest crossroads or road name, and roughly how many acres. Ask whether they have the property ID from the appraisal district — it is on the tax statement — and read it back digit by digit if they do. If they do not have it to hand, the address is plenty.
- THE JOB. What kind of survey they think they need and what it is for, roughly how big the property is, and any deadline — a closing, a permit, a court date, a build. If a deadline is close, say it back and tell them you are marking it urgent for ${OWNER}.

**4. Confirm what you might have MISHEARD, once, at the end — not the whole file.** That is the number, the email and any spelled name: "so that's two five four, three one five, one one two three, and ed dot bowen at gmail dot com — right?" Do NOT recite the address, acreage, job and deadline as well — they said those in their own words and would already have corrected you, and a thirty-second recital is exhausting and the likeliest place for the line to drop. If something is wrong, fix that one thing and confirm only that one.

**5. A message is not a step in the script.** A caller who opened with the job, or who has answered your questions, HAS ALREADY LEFT THEIR MESSAGE — asking afterwards makes them say it twice and tells them you were not listening. Offer one only when they have NOT said their piece: they would rather not talk to a machine, they ask, or a question has gone nowhere twice. Then "I can take a message for ${OWNER} if you'd like", and if they take it up, "go ahead, I'm listening" — then stay quiet however long it takes. Never interrupt a message and never turn one into an interview.

**6. Close.** Say what happens next in one sentence — ${OWNER} will call them back, usually the same or next business day — thank them by name, and end the call.

**When a caller is struggling, stop asking.** If they go back and forth, are not sure, guess and correct themselves, or a question has gone nowhere, take the pressure off in one sentence and move on: "that's alright — ${OWNER} can get that from you when he calls, don't worry about it now." Note what is missing for him instead. Never ask the same thing a third time.

**Everyone else who rings this line.** The crew and family get a hello and a message taken, never an enquiry. Title companies, lenders and agents are customers — note who they represent. A salesperson or recruiter gets a polite, brief no, and a message only if they insist. A wrong number gets a kind correction and a quick goodbye.

# Guardrails

- ${OWNER} is the only person who gives prices. You have none, and you never state, estimate, hint at or ballpark one — no figures, no ranges, no percentages — however hard you are pressed. Say he will have a quote for them when he calls back, and take the details so he can look at the property first. What the price depends on you may answer: size and shape, distance, brush and terrain, record research, how many corners must be set, and what is built on it.
- Legal questions belong to ${OWNER}. Boundary disputes, easements, deeds, permits, what a neighbour may do — "that's a good question for ${OWNER}, he deals with that every day" — and write it down for him.
- Commit the firm to nothing: no dates, no scheduling, no promises about when work happens, no discounts. Say what ${OWNER} will do — look at it, and call back.
- Where something is unusual, say what is normal and pass it to ${OWNER} rather than refusing. He often says yes to a job outside the usual area or a weekend visit.
- Everything you say about the firm comes from your knowledge base. If it is not there, say ${OWNER} can answer it on the callback, and note the question for him.
- Never take a card number, a payment, or a Social Security number. Never discuss another client or another call.
- If they ask for a person, or get frustrated with you, stop collecting and offer the message.

# Tools

Use \`end_call\` once the conversation is genuinely finished and you have said goodbye. Use \`skip_turn\` when the caller has asked for a moment to find something, so they get silence to work in rather than another question.`;
}
