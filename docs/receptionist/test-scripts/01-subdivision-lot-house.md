# 01 · Subdivision lot with a house

**Who is calling** — Dana Whitfield, homeowner in Harker Heights, wants her back corners found before she fences.

**What this is testing** — The easy case. Almost everything is in the message, so the agent should ask two or three questions at most and get off the phone.

**Roughly** 2 minutes · **straightforward**

---

## The call

**1.** “Hi, my name's Dana Whitfield, W-H-I-T-F-I-E-L-D. My number is 254-555-0188. I'm at 2117 Pecan Hollow Drive in Harker Heights — it's a regular subdivision lot, about a quarter acre, house is on it. I want to put up a privacy fence in the back and I need to know exactly where my property line is. Could somebody call me with a price? Thanks.”

   > 👀 She spelled her own surname. It should be recorded as known and never queried.

**2.** “Yeah, that's fine, go ahead.”

**3.** “Yes, I own it. Bought it in 2019.”

   > 👀 It should not ask about structures — she said the house is on it.

**4.** “Email is dwhitfield at gmail dot com. D-W-H-I-T-F-I-E-L-D.”

**5.** “I think we got the survey when we bought it, it's probably in the closing folder. I can look.”

**6.** “No, that's everything. Thank you.”

---

## It should end up with

- firstName Dana
- lastName Whitfield
- phone 254-555-0188
- email
- propertyAddress 2117 Pecan Hollow Drive, Harker Heights
- acreage quarter acre
- structures house
- surveyType boundary
- surveyPurpose fence
- callerRole owner

## It should NEVER have asked about

- structures
- propertyAddress
- surveyPurpose
- phone

*This is the list that matters. An agent that gathers everything by asking about
everything has failed at the only thing separating it from a form.*

## Notes

If this call runs past about two minutes, the agent is asking things it was already told.
