// OffRulesMark — the ⚑ "this is outside what your class and level grant" signal (Area MV, S6).
//
// A custom character may take anything; the point of the flag is that doing so stays VISIBLE. A DM
// reading a sheet should be able to see at a glance what was taken outside the rules, and the
// player should never be able to forget which of their spells was a DM gift versus a normal pick.
//
// Deliberately distinct from its two neighbours: ✎ (Slice 20) = hand-edited away from how it came;
// ★ (Slice 13) = something is modifying this right now; ⚑ = legitimately held, but not by the
// ordinary rules. An element can carry all three — they answer different questions.
//
// The reason travels with the mark rather than being a bare icon, because "why is this flagged?"
// is the only question the flag raises, and an unexplained warning symbol on a character sheet
// reads as a bug. Since CX-11 that explanation is a Tip rather than a native `title`: `title` is
// mouse-only and never appears on touch, so on a tablet the flag WAS the bare icon it was written
// not to be. The copy leads with what the flag MEANS and says outright that it is not an error,
// because a ⚑ in an amber warning colour is otherwise read as one.
import Tip from '@/app/dnd/_ui/Tip'

export default function OffRulesMark({ reason }: { reason?: string }) {
  if (!reason) return null
  const dmGranted = reason.startsWith('granted by the DM')
  const Reason = `${reason.charAt(0).toUpperCase()}${reason.slice(1)}`
  return (
    <Tip
      className="off-rules-mark"
      glyph="⚑"
      bare
      title={dmGranted ? 'Granted by your DM' : 'Outside the normal rules'}
      label={dmGranted ? 'granted by the DM' : 'outside the normal rules'}
      tip={dmGranted
        ? `${Reason}. Your DM handed this to you directly, so it is legitimately yours — the flag is only here so that anyone reading the sheet can see it did not come from your class, species or background at this level. Nothing is wrong and nothing needs fixing.`
        : `${Reason}. This is not an error. A custom character is allowed to hold anything, and ⚑ marks the picks your class, species and level would not normally grant, so you and your DM can tell at a glance which parts of the sheet step outside the rules.`}
      // marginLeft replaces the literal leading space the mark used to carry: the trigger sits in
      // an inline-flex wrapper, which would swallow it.
      triggerStyle={{ marginLeft: 4, color: dmGranted ? 'var(--tealbright)' : '#e0a020' }}
    />
  )
}
