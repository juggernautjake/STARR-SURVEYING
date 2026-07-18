// OptionsMark — a small hoverable "this has options" symbol placed on any sheet element whose behavior is
// governed by a campaign/player preference. Hovering (or focusing) it tells the reader that settings exist for
// this thing and, briefly, what they control. It's the user-facing signpost from a mechanic to its preference
// so a player isn't surprised that (say) their form changed their stats or an item auto-attuned.
//
// Purely presentational — pass the plain-language `tip`. Keyboard-focusable for accessibility.

export default function OptionsMark({ tip, label = 'Options' }: { tip: string; label?: string }) {
  return (
    <span
      className="options-mark"
      role="note"
      aria-label={`${label} — ${tip}`}
      title={`${tip} — set this in Campaign preferences.`}
      tabIndex={0}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 15,
        height: 15,
        marginLeft: 6,
        borderRadius: '50%',
        border: '1px solid var(--hx-line, #2a3b47)',
        color: 'var(--hx-muted, #8aa0ab)',
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1,
        cursor: 'help',
        userSelect: 'none',
        verticalAlign: 'middle',
      }}
    >
      ⚙
    </span>
  );
}
