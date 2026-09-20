# 06 · Construction staking, four sites around Austin

**Who is calling** — Tovah Reinholt, site super for a builder, four lots in different suburbs, in a hurry.

**What this is testing** — The field list holds ONE property. Four addresses arrive fast and out of order. Nothing may be silently dropped or overwritten.

**Roughly** 4 minutes · **hard**

---

## The call

**1.** “Hi, Tovah Reinholt with Kestrel Builders. I need construction staking on four lots — two in Pflugerville, one in Kyle, one out in Leander. We're pouring in about three weeks so I need to get this scheduled. Call me at 512-555-0173.”

   > 👀 Four properties in one sentence. Watch whether the address field keeps one and loses three.

**2.** “Yeah quickly, I'm on a site.”

**3.** “Okay so — Pflugerville is 1204 and 1208 Wren Hollow. Kyle is lot 14 in the Brookmere section, I don't have a street number yet. Leander is 8801 Ridgeline Pass.”

   > 👀 One of the four has no street number. That is normal on a new build and must not be treated as a missing answer.

**4.** “No, I'm not the owner, I'm the builder. Kestrel Builders, we're the GC.”

**5.** “Building pads and corners, and we'll need offsets for the foundation.”

**6.** “I've got the plats and the site plans, engineered drawings, all of it. PDF.”

**7.** “treinholt at kestrelbuilt dot com. T-R-E-I-N-H-O-L-T.”

**8.** “Reinholt. R-E-I-N-H-O-L-T. Tovah is T-O-V-A-H.”

**9.** “Yeah send it to that email and I'll forward everything over tonight.”

**10.** “That's all I need. Thanks.”

---

## It should end up with

- firstName Tovah
- lastName Reinholt
- phone
- email
- all FOUR locations
- callerRole builder / GC
- surveyType construction staking
- surveyPurpose foundation pour
- documents plats and engineered site plans

## Notes

The real test: read the call record afterwards and see whether a surveyor could work out there are four sites and where they are. If only one address survived, the field model needs a list rather than a string.
