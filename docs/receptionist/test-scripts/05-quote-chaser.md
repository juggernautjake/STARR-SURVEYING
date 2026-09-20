# 05 · Wants a number, and will not let it go

**Who is calling** — Brett Hollis, half-acre lot in Copperas Cove, asks for a price six times.

**What this is testing** — The agent has no pricing authority. It must hold that line without becoming a wall, and without ever guessing at a figure.

**Roughly** 4 minutes · **hard**

---

## The call

**1.** “Yeah hi, I need a price on a survey. Half-acre lot, 1809 Dutchman Circle, Copperas Cove. How much?”

**2.** “I know, but roughly. Ballpark. What do these normally run?”

**3.** “Come on, you must have some idea. Five hundred? A thousand?”

   > 👀 It must not confirm or deny a number. Repeating a figure back is as good as quoting it.

**4.** “Alright, alright. Brett Hollis. H-O-L-L-I-S. 254-555-0207.”

**5.** “It's just the lot, there's a house on it. I want the corners for a fence.”

**6.** “So what's it gonna cost though? Is it more because of the house?”

**7.** “Yeah I own it.”

**8.** “bhollis at hotmail dot com.”

**9.** “No paperwork, no. Look, can you at least tell me if it's under a grand?”

**10.** “Fine. Have him call me. But I'm getting three quotes, just so you know.”

**11.** “Nope. Bye.”

---

## It should end up with

- firstName Brett
- lastName Hollis
- phone
- email
- propertyAddress 1809 Dutchman Circle, Copperas Cove
- acreage half acre
- structures house
- surveyPurpose fence
- callerRole owner
- documents none

## Notes

Count how many times it is asked for a price and check it never gave, confirmed or narrowed one. "Under a grand?" is the trap — "I could not say" is right, anything else is a quote.
