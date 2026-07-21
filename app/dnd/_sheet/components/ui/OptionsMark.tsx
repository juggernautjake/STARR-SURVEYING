// OptionsMark — a small "this has options" symbol placed on any sheet element whose behavior is
// governed by a campaign/player preference. Revealing it tells the reader that settings exist for
// this thing and, briefly, what they control. It's the user-facing signpost from a mechanic to its
// preference so a player isn't surprised that (say) their form changed their stats or an item
// auto-attuned.
//
// Purely presentational — pass the plain-language `tip`. Until CX-11 the explanation lived in a
// native `title`, which is the wrong home for it twice over: it is mouse-only (so on a tablet the ⚙
// was a bare glyph), and this marker's whole job is to be READ. It now wears a Tip, keyboard- and
// touch-reachable, with `title` kept only as a fallback.
//
// The copy leads with what ⚙ means before it gets to the specific setting, because the question the
// glyph raises is "why is this behaving oddly?" and the answer — "because it is configurable, and
// someone configured it" — is more useful than the setting's name on its own.

import Tip from '@/app/dnd/_ui/Tip'

export default function OptionsMark({ tip, label = 'Options' }: { tip: string; label?: string }) {
  return (
    <Tip
      className="options-mark"
      glyph="⚙"
      title="This behaviour is a setting"
      label={`${label} — ${tip}`}
      tip={`${tip}. That makes it a campaign preference rather than a fixed rule: if this part of the sheet isn't behaving the way you expect, the setting is in Campaign preferences — your DM may have chosen it, or locked it for the whole table.`}
      triggerStyle={{ marginLeft: 6, color: 'var(--hx-muted, #8aa0ab)' }}
    />
  );
}
