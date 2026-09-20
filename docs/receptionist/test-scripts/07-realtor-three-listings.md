# 07 · Realtor with three listings, two of them vague

**Who is calling** — Priya Raghunathan, agent, wants surveys on three listings before they go live.

**What this is testing** — A repeat commercial caller who is not the owner of anything. Owner-versus-agent must be captured, and she must not be asked "are you the owner" three times.

**Roughly** 3 minutes · **awkward**

---

## The call

**1.** “Hi, this is Priya Raghunathan with Lone Star Realty. I've got three listings coming up that all need existing surveys located or new ones done. One's in Belton, one in Temple, and one I'm not sure about yet — the seller's still deciding. 254-555-0155.”

**2.** “Sure, that's fine.”

**3.** “Raghunathan. R-A-G-H-U-N-A-T-H-A-N. Priya, P-R-I-Y-A.”

**4.** “Belton is 512 North Pearl. Temple is 3300 Scott Boulevard, that's a commercial lot.”

**5.** “I'm the listing agent, not the owner. All three are different sellers.”

**6.** “Two have houses, the Temple one is a commercial building with a parking lot.”

**7.** “Some of them have old surveys, I'd have to check with each seller.”

**8.** “praghunathan at lonestarrealty dot com.”

**9.** “That works. I'll get you what I can find this week.”

**10.** “No, thank you.”

---

## It should end up with

- firstName Priya
- lastName Raghunathan spelled
- phone
- email
- callerRole realtor / listing agent
- three properties, two located
- structures differ per property
- documents uncertain, per seller

## It should NEVER have asked about

- callerRole (twice)

*This is the list that matters. An agent that gathers everything by asking about
everything has failed at the only thing separating it from a form.*
