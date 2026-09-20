# 11 · Silent at first, then answers

**Who is calling** — Someone who did not expect a machine and takes a moment to decide whether to talk to it.

**What this is testing** — The agent should check they are still there, then invite them to speak — not repeat the greeting and not hang up.

**Roughly** 2 minutes · **awkward**

---

## The call

**1.** *(say nothing for 9 seconds)*

   > 👀 After the greeting, nothing. The agent should ask if they are still there.

**2.** “Oh — sorry. Hi. I didn't know if this was a real person.”

**3.** “Yeah, I need a survey. Um. Joanne Keplinger. 254-555-0122.”

**4.** “K-E-P-L-I-N-G-E-R.”

**5.** “It's 806 Hollis Street in Temple. Just a normal lot with a house.”

**6.** “Selling it. The title company asked for one.”

**7.** “jkeplinger at icloud dot com.”

**8.** “No, that's all. Thanks.”

---

## It should end up with

- firstName Joanne
- lastName Keplinger
- phone
- email
- propertyAddress 806 Hollis Street, Temple
- structures house
- surveyPurpose sale, title company asked

## It should NEVER have asked about

- structures

*This is the list that matters. An agent that gathers everything by asking about
everything has failed at the only thing separating it from a form.*
