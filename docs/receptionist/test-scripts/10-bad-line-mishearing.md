# 10 · Terrible phone line

**Who is calling** — Caller on a cell in a truck with the window down. Half of what they say is unclear.

**What this is testing** — Low-confidence transcription across the board. Almost everything should come back unsure, and the agent should confirm rather than guess.

**Roughly** 4 minutes · **hard**

---

## The call

**1.** “[crackle] —is is Garr— [static] —rison, I need a— [static] —vey done on— [wind noise] —cre place off Highway 36—”

   > 👀 Almost nothing is usable. The agent should hold very little and say so plainly.

**2.** “Can you hear me now? Is that better?”

**3.** “Yeah, sorry, I'm driving. Garrison. G-A-R-R-I-S-O-N. First name Wade.”

**4.** “254-555-0176.”

**5.** “It's off Highway 36 between Gatesville and Jonesboro. I'll have to get you the exact address.”

**6.** “Twenty— twenty-two acres. [static] —or twenty-four, I'd have to look.”

**7.** “Say again?”

**8.** “Oh. No, nothing on it. Just pasture and a stock tank.”

**9.** “Fence line dispute with the neighbour. He moved a fence.”

**10.** “wgarrison at [static] —mail dot com. Yeah, gmail.”

**11.** “W-G-A-R-R-I-S-O-N at gmail dot com.”

**12.** “Alright, I'm losing you. Have him call me.”

---

## It should end up with

- firstName Wade
- lastName Garrison spelled
- phone
- email spelled
- propertyAddress approximate — Highway 36 between Gatesville and Jonesboro
- acreage uncertain 22-24
- structures none (pasture and stock tank)
- surveyPurpose fence line dispute

## Notes

A stock tank is a pond, not a structure. If the agent records "structures: stock tank" that is a wrong implication worth fixing.
