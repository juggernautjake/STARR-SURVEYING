# 19 · An email address nobody could guess

**Who is calling** — Straightforward job, but the email takes four attempts.

**What this is testing** — Email spelling. One wrong character makes the estimate undeliverable and nobody finds out.

**Roughly** 3 minutes · **awkward**

---

## The call

**1.** “Hi, Tom Byrne, B-Y-R-N-E. 254-555-0159. Need a boundary survey on a lot in Belton.”

**2.** “Yep, go ahead.”

**3.** “1919 Sparta Road. Third of an acre, there's a house.”

**4.** “Putting in a pool, the city wants a survey.”

**5.** “Yeah I own it.”

**6.** “Email is t dot byrne underscore 74 at proton dot me.”

   > 👀 A dot, an underscore, digits, and a two-letter TLD. This should absolutely come back for spelling.

**7.** “T, dot, B-Y-R-N-E, underscore, seven four, at P-R-O-T-O-N dot M-E.”

**8.** “That's right. Not dot com, dot me.”

**9.** “No. Thanks.”

---

## It should end up with

- firstName Tom
- lastName Byrne
- phone 254-555-0159
- email t.byrne_74@proton.me — exactly, including the underscore and the .me
- propertyAddress 1919 Sparta Road, Belton
- acreage a third of an acre
- structures house
- surveyType boundary
- surveyPurpose pool, city requires a survey
- callerRole owner

## It should NEVER have asked about

- structures

*This is the list that matters. An agent that gathers everything by asking about
everything has failed at the only thing separating it from a form.*

## Notes

Check the final record character by character. "proton.com" would be a silent failure.
