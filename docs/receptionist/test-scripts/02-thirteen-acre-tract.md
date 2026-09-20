# 02 · 13 acres with a house, a shed and a barn

**Who is calling** — Raymond Pruitt, rural tract outside Salado, knows exactly what he wants.

**What this is testing** — A caller who gives MORE detail than the agent asks for. It should not re-ask any of it, and it should keep the corner count, which no field explicitly covers.

**Roughly** 3 minutes · **straightforward**

---

## The call

**1.** “This is Raymond Pruitt, P-R-U-I-T-T, 254-555-0231. I've got thirteen acres out on FM 2484 outside Salado. There's a house, a shed and a barn on it. It's a six-sided tract — six corners — and I need all of them marked and I need a plat drawn. I'm selling forty acres next door and the buyer's lender wants it. Give me a call back.”

   > 👀 Six corners and "plat drawn" are detail the field list has no slot for. It should still end up in the record somewhere rather than being dropped.

**2.** “Sure, go ahead.”

**3.** “Yes sir, it's mine, been in the family since my father bought it.”

**4.** “rpruitt51 at yahoo dot com. R-P-R-U-I-T-T, five one, at yahoo.”

**5.** “I've got the old survey from 1987 and the deed. Both in the safe.”

   > 👀 It should offer the email address and the website for sending those in.

**6.** “How long does something like that usually take?”

**7.** “Alright. No, that's it. Appreciate it.”

---

## It should end up with

- firstName Raymond
- lastName Pruitt
- phone
- email
- acreage 13 acres
- structures house, shed, barn
- propertyAddress FM 2484 outside Salado
- surveyType boundary with plat
- surveyPurpose sale / lender
- documents 1987 survey and deed

## It should NEVER have asked about

- structures
- acreage
- documents

*This is the list that matters. An agent that gathers everything by asking about
everything has failed at the only thing separating it from a form.*

## Notes

Watch whether "six corners" survives anywhere. If it does not, that is a real gap worth a field.
