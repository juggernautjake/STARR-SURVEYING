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
// reads as a bug.
export default function OffRulesMark({ reason }: { reason?: string }) {
  if (!reason) return null
  const dmGranted = reason.startsWith('granted by the DM')
  return (
    <span
      className="off-rules-mark"
      title={dmGranted
        ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)}. Legitimately yours — it just isn't a normal pick for your class and level.`
        : `Outside the rules: ${reason}. Allowed because this is a custom character.`}
      aria-label={dmGranted ? 'granted by the DM' : 'outside the normal rules'}
      style={{ color: dmGranted ? 'var(--tealbright)' : '#e0a020', cursor: 'help' }}
    >
      {' '}⚑
    </span>
  )
}
