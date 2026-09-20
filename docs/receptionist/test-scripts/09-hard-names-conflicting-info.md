# 09 · Hard name, and the story keeps changing

**Who is calling** — Someone whose name is heard three different ways, giving two different addresses and two different acreages.

**What this is testing** — Conflicting information. The agent must notice the conflict and ASK, not silently keep the last value it heard.

**Roughly** 4 minutes · **hard**

---

## The call

**1.** “Yeah this is Xochitl Bergqvist-Nwosu calling, I need a survey on my property at 1400 Calloway, it's about two acres, call me back at 254-555-0198.”

   > 👀 Three-part name, none of it ordinary. This should be very uncertain and get spelled.

**2.** “Yeah alright.”

**3.** “It's X-O-C-H-I-T-L. Then Bergqvist, B-E-R-G-Q-V-I-S-T, hyphen, Nwosu, N-W-O-S-U.”

**4.** “Actually hang on — it's 1400 Calloway Lane, not Calloway Drive. There's both. Mine's the Lane one.”

   > 👀 A correction to a value already recorded. The new one must replace the old cleanly.

**5.** “And it's not two acres, it's two and a half. I was thinking of the other place.”

   > 👀 Second correction, and a hint there IS another property.

**6.** “The other place is my mother's, that's the two acre one. But this call is about mine.”

   > 👀 It should not merge the two properties.

**7.** “No structures on mine. It's empty. The mother's one has a house but that's not what I'm calling about.”

**8.** “Just me. I own it outright.”

**9.** “xbnwosu at protonmail dot com. X-B-N-W-O-S-U.”

**10.** “No documents. Well — a deed. Everyone has a deed, right?”

**11.** “No, that's it.”

---

## It should end up with

- full name spelled correctly
- phone
- email
- propertyAddress 1400 Calloway LANE (corrected)
- acreage 2.5 acres (corrected)
- structures none
- documents deed
- callerRole owner

## It should NEVER have asked about

- structures

*This is the list that matters. An agent that gathers everything by asking about
everything has failed at the only thing separating it from a form.*

## Notes

Check the final record holds Lane and 2.5 — not Drive and 2. And check the mother’s house did not end up attached to this property.
