'use client';
// The four inputs the design profile needs that a plain `<input>` is not.
//
// Kept apart from the form and the editor because both use all four, and a list editor copied twice
// is two list editors — one of which will keep the trailing blank row somebody added and the other
// will not.

import { colourByName, BRAND_COLOURS, GROUP_ORDER, GROUP_LABELS } from '@/lib/branding/palette';
import { fontChoices } from '@/lib/branding/uploads';

// ── a list of lines ─────────────────────────────────────────────────────────────────────────────
//
// Use cases and things to avoid are both lists of short sentences. A textarea split on newlines was
// the first version and it is worse than it looks: it makes reordering a copy-paste job, it gives
// no affordance that the lines are separate things, and it silently produces empty entries from a
// stray blank line — which then render as an empty bullet on the profile.

export function ListEditor({
  label, hint, items, onChange, placeholder,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  // Always one empty row at the end, so adding the next line is typing rather than clicking "add"
  // first. The empty rows are stripped on save; the server drops them too.
  const rows = [...items, ''];

  return (
    <div className="brand-field">
      <label className="brand-field__label">{label}</label>
      {hint && <p className="brand-field__hint">{hint}</p>}
      <div className="brand-listedit">
        {rows.map((value, i) => (
          <div className="brand-listedit__row" key={i}>
            <input
              type="text"
              value={value}
              placeholder={i === rows.length - 1 ? placeholder : ''}
              onChange={(e) => {
                const next = [...items];
                if (i >= next.length) next.push(e.target.value);
                else next[i] = e.target.value;
                onChange(next);
              }}
            />
            {i < items.length && (
              <button type="button" aria-label={`Remove "${value || 'this line'}"`}
                      onClick={() => onChange(items.filter((_, j) => j !== i))}>
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── the colours in the mark ─────────────────────────────────────────────────────────────────────
//
// A multi-select of palette NAMES, grouped exactly as the Colours tab groups them, each rendered in
// its own hex. Free-text hex entry is deliberately not offered: a hex typed here would be a second
// palette, and the profile's whole claim is that the colours in a mark are colours the brand has.
// A colour genuinely missing from the palette is an edit to `palette.ts`, not a string in a row.

export function ColourPicker({
  selected, onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);

  return (
    <div className="brand-field">
      <label className="brand-field__label">Colours in this design</label>
      <p className="brand-field__hint">
        Pick from the {BRAND_COLOURS.length} approved colours. A colour that is genuinely not in the
        palette belongs in <code>lib/branding/palette.ts</code> first — a hex typed here would be a
        second palette that goes stale.
      </p>
      {GROUP_ORDER.map((g) => (
        <div className="brand-pick" key={g}>
          <span className="brand-pick__group">{GROUP_LABELS[g]}</span>
          <div className="brand-pick__opts">
            {BRAND_COLOURS.filter((c) => c.group === g).map((c) => {
              const on = selected.includes(c.name);
              return (
                <button type="button" key={c.name} aria-pressed={on} title={`${c.name} ${c.hex}`}
                        className={`brand-pick__opt${on ? ' brand-pick__opt--on' : ''}`}
                        onClick={() => toggle(c.name)}>
                  <span className="brand-pick__dot" style={{ background: c.hex }} />
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {selected.length > 0 && (
        <p className="brand-field__hint">
          {selected.length} selected — {selected.map((n) => colourByName(n)?.hex ?? '?').join(', ')}
        </p>
      )}
    </div>
  );
}

// ── the type in the mark ────────────────────────────────────────────────────────────────────────
//
// The ten faces plus "Custom lettering", which is first because it is the true answer for most
// marks in this library and a designer sent looking for a font that was never used has been sent on
// a wild goose chase. Free text is allowed alongside — "closest match for rebuilds: Oswald Bold" is
// a real and useful thing to record and it is not a font name.

export function FontPicker({
  selected, onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const choices = fontChoices();
  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);

  // Anything selected that is not one of the offered choices — a note somebody typed.
  const freeform = selected.filter((s) => !choices.includes(s));

  return (
    <div className="brand-field">
      <label className="brand-field__label">Type in this design</label>
      <p className="brand-field__hint">
        Most marks here are custom lettering rather than type set in a face. Say so when that is the
        truth — naming a font a mark was never set in sends somebody looking for a match that does
        not exist.
      </p>
      <div className="brand-pick__opts">
        {choices.map((f) => {
          const on = selected.includes(f);
          return (
            <button type="button" key={f} aria-pressed={on}
                    className={`brand-pick__opt${on ? ' brand-pick__opt--on' : ''}`}
                    onClick={() => toggle(f)}>
              {f}
            </button>
          );
        })}
      </div>
      <ListEditor
        label="Or a note about the type"
        hint="For anything the list above cannot say — “closest match for rebuilds: Oswald Bold”."
        items={freeform}
        placeholder="Closest match for rebuilds: …"
        onChange={(next) => onChange([...selected.filter((s) => choices.includes(s)), ...next])}
      />
    </div>
  );
}

// ── a labelled radio row ────────────────────────────────────────────────────────────────────────
//
// Used for kind, plate and status. A `<select>` was the first version; it hides the hints, and the
// hints are the reason somebody picks correctly — "Photograph" versus "Mark" is obvious, but
// "no plate" versus "white" is not until you read why.

export function ChoiceRow<T extends string>({
  label, hint, value, onChange, options,
}: {
  label: string;
  hint?: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { id: T; label: string; hint?: string }[];
}) {
  return (
    <div className="brand-field">
      <label className="brand-field__label">{label}</label>
      {hint && <p className="brand-field__hint">{hint}</p>}
      <div className="brand-pick__opts">
        {options.map((o) => (
          <button type="button" key={o.id} aria-pressed={value === o.id} title={o.hint}
                  className={`brand-pick__opt${value === o.id ? ' brand-pick__opt--on' : ''}`}
                  onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      {options.find((o) => o.id === value)?.hint && (
        <p className="brand-field__hint">{options.find((o) => o.id === value)!.hint}</p>
      )}
    </div>
  );
}
