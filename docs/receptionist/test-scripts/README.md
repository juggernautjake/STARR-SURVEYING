# Voice agent test scripts

21 callers to rehearse the voicemail intake agent against.

**These are generated.** The source is `lib/receptionist/test-scripts.ts`; edit that
and run `node scripts/write-test-scripts.mjs`. The test bench at
`/admin/dev/receptionist` steps through the same data, so the folder and the thing
being run cannot drift apart.

## How to use one

Open the bench, pick the script, and read the caller lines out loud (or paste them in,
one turn at a time). After the call, check the two lists at the bottom of the script:
what the agent should have ended up with, and — more importantly — what it should
never have asked about.

## The scripts

| # | Script | Who | Minutes | Difficulty |
|---|---|---|---|---|
| 01 | [Subdivision lot with a house](./01-subdivision-lot-house.md) | Dana Whitfield | 2 | straightforward |
| 02 | [13 acres with a house, a shed and a barn](./02-thirteen-acre-tract.md) | Raymond Pruitt | 3 | straightforward |
| 03 | [Elevation certificate, and does not know what one is](./03-elevation-certificate-confused.md) | Marisol Aguirre-Bennett | 4 | awkward |
| 04 | [Just has questions, no job](./04-questions-no-job.md) | Curtis Nakamura | 3 | awkward |
| 05 | [Wants a number, and will not let it go](./05-quote-chaser.md) | Brett Hollis | 4 | hard |
| 06 | [Construction staking, four sites around Austin](./06-construction-staking-austin.md) | Tovah Reinholt | 4 | hard |
| 07 | [Realtor with three listings, two of them vague](./07-realtor-three-listings.md) | Priya Raghunathan | 3 | awkward |
| 08 | [Stutters, pauses, and keeps going to find things](./08-stutters-and-searches.md) | Delbert Oyelaran | 5 | hard |
| 09 | [Hard name, and the story keeps changing](./09-hard-names-conflicting-info.md) | Someone whose name is heard three different ways | 4 | hard |
| 10 | [Terrible phone line](./10-bad-line-mishearing.md) | Caller on a cell in a truck with the window down. Half of what they say is unclear. | 4 | hard |
| 11 | [Silent at first, then answers](./11-silence-then-speaks.md) | Someone who did not expect a machine and takes a moment to decide whether to talk to it. | 2 | awkward |
| 12 | [Silent, and stays silent](./12-silence-then-nothing.md) | A dropped call | 1 | straightforward |
| 13 | [Says almost nothing](./13-sparse-message.md) | Twelve words and a number. Everything has to be asked. | 4 | straightforward |
| 14 | [Property in El Paso](./14-far-out-of-area.md) | Nine hours away. Almost certainly not a job we can take. | 2 | awkward |
| 15 | [Wanted a different kind of surveyor](./15-wrong-business.md) | Looking for a building surveyor to inspect a roof. Wrong trade entirely. | 1 | awkward |
| 16 | [Under contract, has not closed](./16-no-property-yet.md) | Buying 40 acres | 3 | awkward |
| 17 | [Angry about a neighbour, rambles](./17-angry-neighbour-dispute.md) | Been arguing with a neighbour for two years. Wants to tell the whole story. | 5 | hard |
| 18 | [The seven-minute caller](./18-the-talker-seven-minutes.md) | Lovely man. Will talk until the phone dies. Every answer becomes a story. | 7 | hard |
| 19 | [An email address nobody could guess](./19-awkward-email.md) | Straightforward job | 3 | awkward |
| 20 | [Calling on behalf of a parent](./20-calling-for-someone-else.md) | Daughter arranging a survey for her father | 3 | awkward |
| 21 | [Commercial ALTA with a closing date](./21-commercial-alta-deadline.md) | Title company closer. Precise | 2 | straightforward |

## Where to start

1. **Start easy** — the two straightforward ones. If the agent asks about structures on
   a lot somebody has already described as having a house, stop and fix that first.
2. **Then the hard speech** — the stutterer is the single most valuable script here.
   It has a twenty-two second silence in the middle. An agent that survives it will
   survive most real callers.
3. **Then the seven-minute one** — the only script that should reach the cap, and the
   only way to rehearse the wind-down.
