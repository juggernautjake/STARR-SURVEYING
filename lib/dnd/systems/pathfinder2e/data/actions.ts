// lib/dnd/systems/pathfinder2e/data/actions.ts — the PF2 BASIC and SKILL actions (Remaster).
//
// WHY THIS FILE EXISTS: PF2's turn is three actions of equal weight, so "what can I spend an action on"
// is the question the sheet has to answer, and the answer is a finite list rather than a class feature.
// The basic actions here are what EVERY character can do; the skill actions are what a character can do
// because of a skill, which is why `skill` and `minRank` are separate fields — the builder gates a
// trained-only action (Pick a Lock, Treat Wounds) on proficiency, not on a feat.
//
// `degrees` is populated only for actions that genuinely define four (or fewer) outcome tiers. Many
// actions define only Success and Failure — Tumble Through and Hide, for instance — and those keep the
// other two fields absent rather than inventing symmetric text for them.
//
// LICENSING: PF2 mechanics are ORC-licensed, which expressly permits reproducing rules mechanics.
// Reserved Material — Paizo trademarks, deities, characters, locations, lore, art — never appears here.
// Everything below is a paraphrased mechanical summary with the real numbers, never rulebook prose.
//
// GROUND RULE 3 — never invent a rule. Several actions below are deliberately missing a degree or an
// exact distance because the precise value was not certain at authoring time. An absent field reads as
// "not catalogued", which the GM can look up; a guessed field reads as authoritative and is worse.
import type { PF2ActionDef } from '../defs';

export const PF2_ACTIONS: PF2ActionDef[] = [
  // ── Basic actions — available to every character, no proficiency required ──────────────────────
  {
    name: 'Strike',
    cost: '1',
    traits: ['attack'],
    category: 'basic',
    effect:
      'Attack with a weapon or unarmed attack: attack roll against the target’s AC. Each Strike after the first on your turn takes the multiple attack penalty (−5, or −4 with an agile weapon; −10/−8 on the third and later).',
    degrees: {
      critSuccess: 'Double damage.',
      success: 'Normal damage.',
    },
    source: 'Player Core',
  },
  {
    name: 'Stride',
    cost: '1',
    traits: ['move'],
    category: 'basic',
    effect: 'Move up to your Speed.',
    source: 'Player Core',
  },
  {
    name: 'Step',
    cost: '1',
    traits: ['move'],
    category: 'basic',
    requirements: 'Your Speed is at least 10 feet.',
    effect:
      'Move 5 feet without triggering reactions that a move would normally trigger. You cannot Step into difficult terrain.',
    source: 'Player Core',
  },
  {
    name: 'Leap',
    cost: '1',
    traits: ['move'],
    category: 'basic',
    effect:
      'A short controlled jump: up to 10 feet horizontally if your Speed is at least 15 feet, or up to 15 feet if your Speed is at least 30 feet. Jumping vertically clears up to 3 feet up and 5 feet across. A Leap does not trigger reactions triggered by movement.',
    source: 'Player Core',
  },
  {
    name: 'Interact',
    cost: '1',
    traits: ['manipulate'],
    category: 'basic',
    effect:
      'Use your hands on something: draw or stow an item, pick an object up, open a door, or operate a simple mechanism.',
    source: 'Player Core',
  },
  {
    name: 'Release',
    cost: 'free',
    traits: ['manipulate'],
    category: 'basic',
    effect:
      'Let go of something you are holding — an item, or a creature you have Grabbed. Unlike Interact, releasing is free.',
    source: 'Player Core',
  },
  {
    name: 'Ready',
    cost: '2',
    traits: ['concentrate'],
    category: 'basic',
    effect:
      'Name a trigger and a single action or free action to take when it occurs. The prepared action becomes a reaction you can use until the start of your next turn.',
    source: 'Player Core',
  },
  {
    name: 'Delay',
    cost: 'free',
    traits: [],
    category: 'basic',
    trigger: 'Your turn begins.',
    effect:
      'Your turn ends immediately without taking any actions. Later in the round, after another creature’s turn, you can return and take your turn — permanently moving to that place in the initiative order. Any persistent damage or conditions that would resolve on your turn resolve when you Delay.',
    source: 'Player Core',
  },
  {
    name: 'Aid',
    cost: 'reaction',
    traits: ['visual'],
    category: 'basic',
    trigger: 'An ally is about to attempt a check you could help with.',
    requirements: 'You prepared to help earlier in the round, spending an action to do so.',
    effect:
      'Attempt a check to assist. The GM sets the DC, usually 20, and chooses which check you roll.',
    degrees: {
      critSuccess:
        'Your ally gains a +2 circumstance bonus — +3 if you are a master in the check you attempted, +4 if legendary.',
      success: 'Your ally gains a +1 circumstance bonus.',
      critFailure: 'Your ally takes a −1 circumstance penalty.',
    },
    source: 'Player Core',
  },
  {
    name: 'Seek',
    cost: '1',
    traits: ['concentrate', 'secret'],
    category: 'basic',
    effect:
      'Scan an area — a 30-foot cone or burst — for hidden creatures and objects. Perception check against the target’s Stealth DC.',
    degrees: {
      critSuccess: 'An Undetected creature becomes Observed to you.',
      success: 'An Undetected creature becomes Hidden, and a Hidden creature becomes Observed.',
    },
    source: 'Player Core',
  },
  {
    name: 'Point Out',
    cost: '1',
    traits: ['auditory', 'manipulate', 'visual'],
    category: 'basic',
    requirements: 'You can see the creature and your allies can hear or see you.',
    effect:
      'Indicate a creature that is Undetected or Hidden to an ally. It becomes Hidden to that ally instead of Undetected — an improvement, not a reveal.',
    source: 'Player Core',
  },
  {
    name: 'Sense Motive',
    cost: '1',
    traits: ['concentrate', 'secret'],
    category: 'basic',
    effect:
      'Read a creature’s behaviour for deception or magical influence. Perception check against its Deception DC (or the effect’s DC).',
    degrees: {
      critSuccess: 'You determine the creature’s true intentions and what it is concealing.',
      success: 'You can tell whether the creature is behaving normally, but not the specifics.',
      failure: 'You detect nothing out of the ordinary.',
      critFailure: 'You draw an incorrect conclusion about the creature’s intentions.',
    },
    source: 'Player Core',
  },
  {
    name: 'Take Cover',
    cost: '1',
    traits: [],
    category: 'basic',
    requirements: 'You are benefiting from cover, are near a feature that lets you take cover, or are Prone.',
    effect:
      'Press against your cover to improve it: standard cover (+2 circumstance bonus to AC) becomes greater cover (+4), and a feature that would not otherwise help grants standard cover.',
    source: 'Player Core',
  },
  {
    name: 'Raise a Shield',
    cost: '1',
    traits: [],
    category: 'basic',
    requirements: 'You are wielding a shield.',
    effect:
      'Position the shield to protect yourself. You gain its circumstance bonus to AC until the start of your next turn, and while it is raised you can use Shield Block if you have that reaction.',
    source: 'Player Core',
  },
  {
    name: 'Escape',
    cost: '1',
    traits: ['attack'],
    category: 'basic',
    effect:
      'Break out of a hold or bindings. Roll your unarmed attack modifier, Acrobatics, or Athletics — whichever is best — against the DC of the effect holding you. Escape counts toward your multiple attack penalty.',
    degrees: {
      success: 'You are freed: the Grabbed, Immobilized, or Restrained condition from that effect ends.',
      failure: 'You remain held.',
    },
    source: 'Player Core',
  },
  {
    name: 'Grapple',
    cost: '1',
    traits: ['attack'],
    category: 'skill',
    skill: 'Athletics',
    effect:
      'Athletics check against the target’s Fortitude DC. Requires a free hand; the target must be within reach and no more than one size larger than you.',
    degrees: {
      critSuccess: 'The target is Grabbed until the end of your next turn.',
      success: 'The target is Grabbed until the end of your current turn.',
      failure: 'You fail; if you already had the target Grabbed or Restrained, that ends.',
      critFailure:
        'You lose your hold. The target can either Grab you or force you to fall Prone, its choice.',
    },
    source: 'Player Core',
  },
  {
    name: 'Shove',
    cost: '1',
    traits: ['attack'],
    category: 'skill',
    skill: 'Athletics',
    requirements: 'You have at least one free hand, and the target is no more than one size larger than you.',
    effect: 'Athletics check against the target’s Fortitude DC.',
    degrees: {
      critSuccess:
        'Push the target up to 10 feet away. You can Stride after it, but must move the same distance in the same direction.',
      success: 'Push the target 5 feet away. You can Stride after it on the same terms.',
      critFailure: 'You lose your balance and fall Prone.',
    },
    source: 'Player Core',
  },
  {
    name: 'Trip',
    cost: '1',
    traits: ['attack'],
    category: 'skill',
    skill: 'Athletics',
    requirements: 'You have at least one free hand, and the target is no more than one size larger than you.',
    effect: 'Athletics check against the target’s Reflex DC.',
    degrees: {
      critSuccess: 'The target falls Prone and takes 1d6 bludgeoning damage.',
      success: 'The target falls Prone.',
      critFailure: 'You lose your balance and fall Prone.',
    },
    source: 'Player Core',
  },
  {
    name: 'Disarm',
    cost: '1',
    traits: ['attack'],
    category: 'skill',
    skill: 'Athletics',
    // Disarm is the one Athletics action gated on trained proficiency — the gate is the point of minRank.
    minRank: 'trained',
    requirements: 'You have at least one free hand, and the target is no more than one size larger than you.',
    effect: 'Athletics check against the target’s Reflex DC.',
    degrees: {
      critSuccess: 'You knock the item free; it lands in the target’s space.',
      success:
        'You weaken the grip: until the start of that creature’s turn it takes a −2 circumstance penalty to attack rolls with the item, and attempts to Disarm it gain a +2 circumstance bonus.',
      critFailure: 'You lose your balance and are Off-Guard until the start of your next turn.',
    },
    source: 'Player Core',
  },
  {
    name: 'Crawl',
    cost: '1',
    traits: ['move'],
    category: 'basic',
    requirements: 'You are Prone and your Speed is at least 10 feet.',
    effect: 'Move 5 feet while remaining Prone.',
    source: 'Player Core',
  },
  {
    name: 'Drop Prone',
    cost: '1',
    traits: ['move'],
    category: 'basic',
    effect: 'You fall Prone deliberately.',
    source: 'Player Core',
  },
  {
    name: 'Stand',
    cost: '1',
    traits: ['move'],
    category: 'basic',
    requirements: 'You are Prone.',
    effect: 'You get to your feet, ending the Prone condition.',
    source: 'Player Core',
  },
  {
    name: 'Sustain',
    cost: '1',
    traits: ['concentrate'],
    category: 'basic',
    requirements: 'You have an active effect with a sustained duration.',
    effect:
      'Extend the effect’s duration until the end of your next turn. Some sustained effects also let you change a target or move an area when you Sustain them.',
    source: 'Player Core',
  },
  {
    name: 'Dismiss',
    cost: '1',
    traits: ['concentrate'],
    category: 'basic',
    effect: 'End one effect you created, or one affecting you, that states it can be dismissed.',
    source: 'Player Core',
  },
  {
    name: 'Avert Gaze',
    cost: '1',
    traits: ['concentrate'],
    category: 'basic',
    effect:
      'Look away from danger. Until the start of your next turn you gain a +2 circumstance bonus to saving throws against visual effects that require you to look at a creature or object.',
    source: 'Player Core',
  },
  {
    name: 'Burrow',
    cost: '1',
    traits: ['move'],
    category: 'basic',
    requirements: 'You have a burrow Speed.',
    effect:
      'Tunnel through earth, sand, or similarly loose material up to your burrow Speed. Burrowing does not leave a tunnel behind unless the effect says so.',
    source: 'Player Core',
  },
  {
    name: 'Fly',
    cost: '1',
    traits: ['move'],
    category: 'basic',
    requirements: 'You have a fly Speed.',
    effect:
      'Move through the air up to your fly Speed, in any direction including straight up. Moving straight down counts as half the distance.',
    source: 'Player Core',
  },

  // ── Skill actions ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'Climb',
    cost: '1',
    traits: ['move'],
    category: 'skill',
    skill: 'Athletics',
    requirements: 'You have two free hands and are at the base of a climbable surface.',
    effect: 'Athletics check against the surface’s Climb DC.',
    degrees: {
      critSuccess: 'You move 10 feet up, across, or down the surface.',
      success: 'You move 5 feet up, across, or down the surface.',
      failure: 'You make no progress.',
      critFailure: 'You fall, taking falling damage for the distance, and land Prone.',
    },
    source: 'Player Core',
  },
  {
    name: 'Swim',
    cost: '1',
    traits: ['move'],
    category: 'skill',
    skill: 'Athletics',
    requirements: 'You are in or adjacent to water.',
    effect:
      'Athletics check against the water’s Swim DC. A creature with a swim Speed simply Swims up to that Speed without a check.',
    degrees: {
      critSuccess: 'You move 10 feet through the water.',
      success: 'You move 5 feet through the water.',
      failure: 'You make no progress.',
    },
    source: 'Player Core',
  },
  {
    name: 'High Jump',
    cost: '2',
    traits: [],
    category: 'skill',
    skill: 'Athletics',
    effect:
      'Stride, then Leap vertically. Attempt a DC 30 Athletics check, or DC 20 if you Strode at least 10 feet first.',
    degrees: {
      critSuccess: 'You clear up to 8 feet vertically.',
      success: 'You clear up to 5 feet vertically.',
      failure: 'You Leap normally.',
      critFailure: 'You do not Leap and fall Prone in your space.',
    },
    source: 'Player Core',
  },
  {
    name: 'Long Jump',
    cost: '2',
    traits: [],
    category: 'skill',
    skill: 'Athletics',
    effect:
      'Stride, then Leap horizontally. The Athletics DC equals the distance in feet you are trying to cover, which can never exceed your Speed.',
    degrees: {
      success: 'You clear the chosen distance.',
      failure: 'You Leap the normal distance instead.',
      critFailure: 'You Leap the normal distance, then fall and land Prone.',
    },
    source: 'Player Core',
  },
  {
    name: 'Force Open',
    cost: '1',
    traits: ['attack'],
    category: 'skill',
    skill: 'Athletics',
    effect:
      'Break open a door, lid, container, or similar barrier by brute strength. Athletics check against its DC; without a crowbar or comparable tool you take a −2 item penalty.',
    degrees: {
      critSuccess: 'You open it without damaging it.',
      success: 'You open it, but it is Broken in the process.',
      failure: 'It holds.',
      critFailure: 'You jam it, making later attempts harder.',
    },
    source: 'Player Core',
  },
  {
    name: 'Balance',
    cost: '1',
    traits: ['move'],
    category: 'skill',
    skill: 'Acrobatics',
    effect: 'Cross a narrow surface or uneven ground. Acrobatics check against the surface’s DC.',
    degrees: {
      critSuccess: 'You move up to your Speed.',
      success: 'You move up to your Speed, treating the surface as difficult terrain.',
      failure: 'You must remain still to keep your balance, wasting the action, or you fall.',
      critFailure: 'You fall and your turn ends.',
    },
    source: 'Player Core',
  },
  {
    name: 'Tumble Through',
    cost: '1',
    traits: ['move'],
    category: 'skill',
    skill: 'Acrobatics',
    effect:
      'Move through an enemy’s space during a Stride. Acrobatics check against that enemy’s Reflex DC.',
    degrees: {
      success: 'You move through its space, treating that space as difficult terrain.',
      failure: 'Your movement ends there, and moving away triggers reactions as normal.',
    },
    source: 'Player Core',
  },
  {
    name: 'Hide',
    cost: '1',
    traits: ['secret'],
    category: 'skill',
    skill: 'Stealth',
    requirements:
      'You are Concealed from, or have cover or greater cover against, every creature you are currently Observed by.',
    effect: 'Stealth check against each such creature’s Perception DC.',
    degrees: {
      success: 'You become Hidden to that creature instead of Observed.',
      failure: 'You remain Observed by it.',
    },
    source: 'Player Core',
  },
  {
    name: 'Sneak',
    cost: '1',
    traits: ['move', 'secret'],
    category: 'skill',
    skill: 'Stealth',
    requirements: 'You are Hidden from or Undetected by the creature you are sneaking past.',
    effect:
      'Move up to half your Speed, attempting a Stealth check against that creature’s Perception DC. You need cover or concealment where you end the movement to stay unseen.',
    degrees: {
      success: 'You are Undetected by the creature during and after the movement.',
      failure: 'You become Hidden to it rather than Undetected.',
    },
    source: 'Player Core',
  },
  {
    name: 'Feint',
    cost: '1',
    traits: ['mental'],
    category: 'skill',
    skill: 'Deception',
    minRank: 'trained',
    requirements: 'You are within melee reach of the target.',
    effect: 'Deception check against the target’s Perception DC.',
    degrees: {
      critSuccess: 'The target is Off-Guard against your melee attacks until the end of your next turn.',
      success:
        'The target is Off-Guard against your next melee attack, and no later than the end of your current turn.',
      critFailure: 'You are Off-Guard against the target until the end of your next turn.',
    },
    source: 'Player Core',
  },
  {
    name: 'Lie',
    cost: 'varies',
    traits: ['auditory', 'concentrate', 'linguistic', 'mental', 'secret'],
    category: 'skill',
    skill: 'Deception',
    effect:
      'Tell a falsehood convincingly. Takes at least one action and often much longer, depending on the conversation. Deception check against the Perception DC of every listener; the GM adjusts for how implausible the lie is.',
    degrees: {
      success: 'The listener believes you.',
      failure: 'The listener does not believe you and grows suspicious.',
    },
    source: 'Player Core',
  },
  {
    name: 'Demoralize',
    cost: '1',
    traits: ['auditory', 'concentrate', 'emotion', 'fear', 'mental'],
    category: 'skill',
    skill: 'Intimidation',
    effect:
      'Threaten one creature within 30 feet that can see or hear you. Intimidation check against its Will DC. Whatever the outcome, that creature is temporarily immune to your Demoralize for 10 minutes.',
    degrees: {
      critSuccess: 'The target becomes Frightened 2.',
      success: 'The target becomes Frightened 1.',
    },
    source: 'Player Core',
  },
  {
    name: 'Coerce',
    cost: 'varies',
    traits: ['auditory', 'concentrate', 'emotion', 'linguistic', 'mental'],
    category: 'skill',
    skill: 'Intimidation',
    effect:
      'Threaten a creature into cooperating. Takes about a minute of conversation. Intimidation check against its Will DC.',
    degrees: {
      critSuccess: 'It complies, and afterwards its attitude toward you is Unfriendly.',
      success: 'It complies, but afterwards its attitude toward you is Hostile.',
      failure: 'It refuses and becomes Hostile toward you.',
      critFailure: 'It refuses, becomes Hostile, and cannot be Coerced by you again for a week.',
    },
    source: 'Player Core',
  },
  {
    name: 'Request',
    cost: '1',
    traits: ['auditory', 'concentrate', 'linguistic', 'mental'],
    category: 'skill',
    skill: 'Diplomacy',
    effect:
      'Ask a creature for something. Diplomacy check against a DC the GM sets from the creature’s attitude and how burdensome the request is.',
    degrees: {
      critSuccess: 'It agrees without conditions.',
      success: 'It agrees, but may want something in return.',
      failure: 'It refuses.',
      critFailure: 'It refuses and its attitude toward you worsens by one step.',
    },
    source: 'Player Core',
  },
  {
    name: 'Make an Impression',
    cost: 'varies',
    traits: ['auditory', 'concentrate', 'exploration', 'linguistic', 'mental'],
    category: 'skill',
    skill: 'Diplomacy',
    effect:
      'Spend about a minute in conversation to improve how a creature regards you. Diplomacy check against its Will DC. The change lasts only for the current social interaction unless the GM says otherwise.',
    degrees: {
      critSuccess: 'Its attitude toward you improves by two steps.',
      success: 'Its attitude toward you improves by one step.',
      failure: 'Its attitude is unchanged.',
      critFailure: 'Its attitude toward you worsens by one step.',
    },
    source: 'Player Core',
  },
  {
    name: 'Recall Knowledge',
    cost: '1',
    traits: ['concentrate', 'secret'],
    category: 'skill',
    effect:
      'Remember what you know about a creature, place, or topic. Roll the skill that covers the subject — Arcana, Nature, Religion, Occultism, Society, Crafting, Medicine, or a relevant Lore — against a DC the GM sets from how obscure the answer is.',
    degrees: {
      critSuccess: 'You recall the information correctly and learn something additional.',
      success: 'You recall the information correctly.',
      failure: 'You recall nothing useful.',
      critFailure: 'You recall something incorrect, and believe it.',
    },
    source: 'Player Core',
  },
  {
    name: 'Administer First Aid',
    cost: '2',
    traits: ['manipulate'],
    category: 'skill',
    skill: 'Medicine',
    requirements: 'You are wielding or wearing healer’s tools and are adjacent to the patient.',
    effect:
      'Choose to stabilize a Dying creature or to stop bleeding. Stabilizing uses a DC of 5 plus that creature’s recovery-check DC; stopping bleeding uses a DC the GM sets from the persistent damage.',
    degrees: {
      success:
        'Stabilize: the creature loses the Dying condition, though it stays Unconscious at 0 Hit Points. Stop bleeding: the persistent bleed damage ends.',
      critFailure: 'You deal 1d8 damage to the patient.',
    },
    source: 'Player Core',
  },
  {
    name: 'Treat Wounds',
    cost: 'varies',
    traits: ['exploration', 'healing', 'manipulate'],
    category: 'skill',
    skill: 'Medicine',
    minRank: 'trained',
    requirements: 'Healer’s tools, and 10 minutes spent tending one injured creature.',
    effect:
      'The base DC is 15. You may choose a higher DC for more healing: DC 20 adds 10 Hit Points and needs expert Medicine, DC 30 adds 30 and needs master, DC 40 adds 50 and needs legendary. On a success or critical success the patient is immune to Treat Wounds for 1 hour.',
    degrees: {
      critSuccess: 'The patient regains 4d8 Hit Points and loses the Wounded condition.',
      success: 'The patient regains 2d8 Hit Points and loses the Wounded condition.',
      critFailure: 'You deal 1d8 damage to the patient.',
    },
    source: 'Player Core',
  },
  {
    name: 'Repair',
    cost: 'varies',
    traits: ['exploration', 'manipulate'],
    category: 'skill',
    skill: 'Crafting',
    requirements: 'A repair kit, and 10 minutes of work on a damaged item.',
    effect:
      'Crafting check against a DC the GM sets from the item’s level and complexity. A success restores Hit Points to the item, scaling with your Crafting proficiency rank.',
    degrees: {
      failure: 'You make no progress.',
      critFailure: 'You damage the item further.',
    },
    source: 'Player Core',
  },
  {
    name: 'Pick a Lock',
    cost: '2',
    traits: ['manipulate'],
    category: 'skill',
    skill: 'Thievery',
    minRank: 'trained',
    requirements: 'You are holding thieves’ tools.',
    effect:
      'Thievery check against the lock’s DC. Better locks need several successes before they open.',
    degrees: {
      critSuccess: 'The lock opens; if it needed multiple successes, this counts as two.',
      success: 'You earn one success toward opening the lock.',
      critFailure: 'You break one of your picks.',
    },
    source: 'Player Core',
  },
  {
    name: 'Disable a Device',
    cost: '2',
    traits: ['manipulate'],
    category: 'skill',
    skill: 'Thievery',
    minRank: 'trained',
    requirements: 'The device is within reach; some devices also require thieves’ tools.',
    effect:
      'Thievery check against the device’s DC. Complex devices need several successes before they are disabled.',
    degrees: {
      critSuccess: 'You disable the device; if it needed multiple successes, this counts as two.',
      success: 'You earn one success toward disabling the device.',
      critFailure: 'You trigger the device.',
    },
    source: 'Player Core',
  },
  {
    name: 'Palm an Object',
    cost: '1',
    traits: ['manipulate'],
    category: 'skill',
    skill: 'Thievery',
    effect:
      'Pick up an unattended small object without being seen. Thievery check against the Perception DC of each observer.',
    degrees: {
      success: 'You take the object unnoticed by that creature.',
      failure: 'You take the object, but that creature notices.',
    },
    source: 'Player Core',
  },
  {
    name: 'Steal',
    cost: '1',
    traits: ['manipulate'],
    category: 'skill',
    skill: 'Thievery',
    requirements: 'The target is within reach; the item is not closely guarded or actively held.',
    effect:
      'Take a small object from another creature. Thievery check against the Perception DC of the target and any observers.',
    degrees: {
      success: 'You take the item unnoticed.',
      failure: 'You fail to take the item, and the target notices the attempt.',
    },
    source: 'Player Core',
  },
];

// ── Convenience lookup ──────────────────────────────────────────────────────────────────────────
export const pf2Action = (name: string) =>
  PF2_ACTIONS.find(a => a.name.toLowerCase() === name.toLowerCase()) || null;
