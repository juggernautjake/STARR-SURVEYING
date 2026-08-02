'use client';
// app/AndrewAsh/studio/pages/[id]/BlockInspector.tsx — the controls for one block.
//
// Two halves: CONTENT (what it says) and STYLE (how it looks). Content is per widget type; style is
// shared, with irrelevant groups hidden — a divider does not get a font-size slider, because a
// control that does nothing teaches the user that the controls are noise.
//
// ── THE PHONE SWITCH IS THE INTERESTING PART ────────────────────────────────────────────────────
//
// When the builder is in phone mode, style edits write to `mobileStyle` instead of `style`. The
// consequences are what the owner asked for:
//
//   · Andrew changes a heading size on the phone view; the desktop size is untouched.
//   · Any control he has NOT overridden keeps following desktop plus the automatic adaptation, so
//     editing the desktop version still moves the phone version.
//   · Each overridden control shows a dot and a "match desktop" reset, so he can always see what has
//     diverged and put it back.
//
// The sparse patch is what makes that work — see the note on `Widget.mobileStyle`.

import { useState } from 'react';
import { Monitor, RotateCcw, Smartphone } from 'lucide-react';

import {
  RADIUS_SCALE,
  SPACING_SCALE,
  TYPE_SCALE,
  WIDGET_ALIGNS,
  WIDGET_ASPECTS,
  WIDGET_SHADOWS,
  WIDGET_WIDTHS,
  clearMobileOverride,
  relevantControls,
  resolveMobileStyle,
  type Widget,
  type WidgetStyle,
} from '@/lib/voice/widgets';
import { COLOR_TOKENS } from '@/lib/voice/style';
import { ANDREW_PHOTOS } from '@/lib/voice/photos';

interface Props {
  widget: Widget;
  device: 'desktop' | 'mobile';
  onChange: (patch: Partial<Widget>) => void;
  onDeviceChange: (device: 'desktop' | 'mobile') => void;
}

export default function BlockInspector({ widget, device, onChange, onDeviceChange }: Props): React.ReactElement {
  const [tab, setTab] = useState<'content' | 'style'>('content');
  const controls = relevantControls(widget.type);
  const isMobile = device === 'mobile';

  // The values shown are the RESOLVED ones for the current device, so the slider reflects what is on
  // screen — including whatever the automatic adaptation did. Showing the raw desktop value while the
  // phone preview shows something else is how a responsive editor becomes untrustworthy.
  const effective: WidgetStyle = isMobile ? resolveMobileStyle(widget) : (widget.style ?? {});
  const overridden = new Set(Object.keys(widget.mobileStyle ?? {}));

  const setStyle = (key: keyof WidgetStyle, value: unknown): void => {
    if (isMobile) {
      onChange({ mobileStyle: { ...(widget.mobileStyle ?? {}), [key]: value } as Partial<WidgetStyle> });
    } else {
      onChange({ style: { [key]: value } as Partial<WidgetStyle> });
    }
  };

  const resetMobile = (key: keyof WidgetStyle): void => {
    const next = clearMobileOverride(widget, key);
    onChange({ mobileStyle: next.mobileStyle });
  };

  const setProp = (key: string, value: unknown): void => onChange({ props: { [key]: value } });

  return (
    <div className="vaInspector">
      <div className="vaInspectorTabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'content'} onClick={() => setTab('content')}>
          Content
        </button>
        <button type="button" role="tab" aria-selected={tab === 'style'} onClick={() => setTab('style')}>
          Style
        </button>
      </div>

      {tab === 'style' && (
        <div className="vaInspectorDevice">
          <button type="button" aria-pressed={!isMobile} onClick={() => onDeviceChange('desktop')}>
            <Monitor size={13} aria-hidden /> Desktop
          </button>
          <button type="button" aria-pressed={isMobile} onClick={() => onDeviceChange('mobile')}>
            <Smartphone size={13} aria-hidden /> Phone
          </button>
        </div>
      )}

      {tab === 'style' && isMobile && (
        <p className="vaInspectorNote">
          Changes here apply to <strong>phones only</strong>. Anything you do not change keeps following
          the desktop version automatically.
        </p>
      )}

      {tab === 'content' ? (
        <ContentFields widget={widget} setProp={setProp} />
      ) : (
        <>
          <Group title="Layout">
            <Choice
              label="Width"
              value={effective.width ?? 'normal'}
              options={WIDGET_WIDTHS.map((v) => ({ value: v, label: v }))}
              onChange={(v) => setStyle('width', v)}
              overridden={isMobile && overridden.has('width')}
              onReset={() => resetMobile('width')}
            />
            <Choice
              label="Align"
              value={effective.align ?? 'left'}
              options={WIDGET_ALIGNS.map((v) => ({ value: v, label: v }))}
              onChange={(v) => setStyle('align', v)}
              overridden={isMobile && overridden.has('align')}
              onReset={() => resetMobile('align')}
            />
            <Slider
              label="Space above"
              value={effective.spaceAbove ?? 5}
              max={SPACING_SCALE.length - 1}
              display={`${SPACING_SCALE[effective.spaceAbove ?? 5]}px`}
              onChange={(v) => setStyle('spaceAbove', v)}
              overridden={isMobile && overridden.has('spaceAbove')}
              onReset={() => resetMobile('spaceAbove')}
            />
            <Slider
              label="Space below"
              value={effective.spaceBelow ?? 5}
              max={SPACING_SCALE.length - 1}
              display={`${SPACING_SCALE[effective.spaceBelow ?? 5]}px`}
              onChange={(v) => setStyle('spaceBelow', v)}
              overridden={isMobile && overridden.has('spaceBelow')}
              onReset={() => resetMobile('spaceBelow')}
            />
            {controls.surface && (
              <Slider
                label="Inner padding"
                value={effective.padding ?? 0}
                max={SPACING_SCALE.length - 1}
                display={`${SPACING_SCALE[effective.padding ?? 0]}px`}
                onChange={(v) => setStyle('padding', v)}
                overridden={isMobile && overridden.has('padding')}
                onReset={() => resetMobile('padding')}
              />
            )}
          </Group>

          {controls.typography && (
            <Group title="Type">
              <Slider
                label="Text size"
                value={effective.size ?? 4}
                max={TYPE_SCALE.length - 1}
                display={`${TYPE_SCALE[effective.size ?? 4]}rem`}
                onChange={(v) => setStyle('size', v)}
                overridden={isMobile && overridden.has('size')}
                onReset={() => resetMobile('size')}
              />
              <Choice
                label="Typeface"
                value={effective.font ?? 'body'}
                options={[
                  { value: 'display', label: 'Display (Cinzel)' },
                  { value: 'body', label: 'Body (Inter)' },
                  { value: 'mono', label: 'Monospace' },
                ]}
                onChange={(v) => setStyle('font', v)}
                overridden={isMobile && overridden.has('font')}
                onReset={() => resetMobile('font')}
              />
              <Choice
                label="Weight"
                value={String(effective.weight ?? 400)}
                options={[
                  { value: '300', label: 'Light' },
                  { value: '400', label: 'Regular' },
                  { value: '500', label: 'Medium' },
                  { value: '600', label: 'Semibold' },
                  { value: '700', label: 'Bold' },
                ]}
                onChange={(v) => setStyle('weight', Number(v))}
                overridden={isMobile && overridden.has('weight')}
                onReset={() => resetMobile('weight')}
              />
              <Slider
                label="Line height"
                value={effective.leading ?? 16}
                min={9}
                max={26}
                display={((effective.leading ?? 16) / 10).toFixed(1)}
                onChange={(v) => setStyle('leading', v)}
                overridden={isMobile && overridden.has('leading')}
                onReset={() => resetMobile('leading')}
              />
              <Slider
                label="Letter spacing"
                value={effective.tracking ?? 0}
                min={-3}
                max={30}
                display={`${((effective.tracking ?? 0) / 100).toFixed(2)}em`}
                onChange={(v) => setStyle('tracking', v)}
                overridden={isMobile && overridden.has('tracking')}
                onReset={() => resetMobile('tracking')}
              />
              <Toggle
                label="Uppercase"
                checked={effective.uppercase === true}
                onChange={(v) => setStyle('uppercase', v)}
              />
            </Group>
          )}

          <Group title="Colour">
            <ColorPick
              label="Background"
              value={effective.background ?? null}
              onChange={(v) => setStyle('background', v)}
              overridden={isMobile && overridden.has('background')}
              onReset={() => resetMobile('background')}
            />
            <ColorPick
              label="Text"
              value={effective.textColor ?? null}
              onChange={(v) => setStyle('textColor', v)}
              overridden={isMobile && overridden.has('textColor')}
              onReset={() => resetMobile('textColor')}
            />
            <ColorPick
              label="Accent"
              value={effective.accentColor ?? null}
              onChange={(v) => setStyle('accentColor', v)}
              overridden={isMobile && overridden.has('accentColor')}
              onReset={() => resetMobile('accentColor')}
            />
          </Group>

          {controls.surface && (
            <Group title="Frame">
              <Slider
                label="Corner rounding"
                value={effective.radius ?? 3}
                max={RADIUS_SCALE.length - 1}
                display={`${RADIUS_SCALE[effective.radius ?? 3]}px`}
                onChange={(v) => setStyle('radius', v)}
                overridden={isMobile && overridden.has('radius')}
                onReset={() => resetMobile('radius')}
              />
              <Choice
                label="Shadow"
                value={effective.shadow ?? 'none'}
                options={WIDGET_SHADOWS.map((v) => ({ value: v, label: v }))}
                onChange={(v) => setStyle('shadow', v)}
                overridden={isMobile && overridden.has('shadow')}
                onReset={() => resetMobile('shadow')}
              />
            </Group>
          )}

          {controls.media && (
            <Group title="Media">
              <Slider
                label="Media size"
                value={effective.mediaScale ?? 100}
                min={10}
                max={100}
                step={5}
                display={`${effective.mediaScale ?? 100}%`}
                onChange={(v) => setStyle('mediaScale', v)}
                overridden={isMobile && overridden.has('mediaScale')}
                onReset={() => resetMobile('mediaScale')}
              />
              <Choice
                label="Shape"
                value={effective.aspect ?? 'auto'}
                options={WIDGET_ASPECTS.map((v) => ({ value: v, label: v }))}
                onChange={(v) => setStyle('aspect', v)}
                overridden={isMobile && overridden.has('aspect')}
                onReset={() => resetMobile('aspect')}
              />
            </Group>
          )}

          <Group title="On phones">
            <Toggle
              label="Adapt automatically"
              checked={widget.autoMobile !== false}
              onChange={(v) => onChange({ autoMobile: v })}
              hint="Shrinks big headings, stacks columns and pulls in spacing. Your own phone changes always win."
            />
            <Toggle
              label="Hide on phones"
              checked={widget.hiddenOnMobile === true}
              onChange={(v) => onChange({ hiddenOnMobile: v })}
            />
            <Toggle
              label="Hide on desktop"
              checked={widget.hiddenOnDesktop === true}
              onChange={(v) => onChange({ hiddenOnDesktop: v })}
            />
          </Group>
        </>
      )}
    </div>
  );
}

// ── Content fields ───────────────────────────────────────────────────────────────────────────────

function ContentFields({
  widget,
  setProp,
}: {
  widget: Widget;
  setProp: (key: string, value: unknown) => void;
}): React.ReactElement {
  const p = widget.props ?? {};
  const s = (key: string, fallback = ''): string => (typeof p[key] === 'string' ? (p[key] as string) : fallback);

  const text = (key: string, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input className="vaInput" value={s(key)} onChange={(e) => setProp(key, e.target.value)} />
    </Field>
  );

  const area = (key: string, label: string, rows = 6, hint?: string) => (
    <Field label={label} hint={hint}>
      <textarea className="vaTextarea" rows={rows} value={s(key)} onChange={(e) => setProp(key, e.target.value)} />
    </Field>
  );

  const photo = (key: string, label: string) => (
    <Field label={label}>
      <select className="vaSelect" value={s(key)} onChange={(e) => setProp(key, e.target.value)}>
        <option value="">None</option>
        {ANDREW_PHOTOS.map((ph) => (
          <option key={ph.id} value={ph.id}>
            {ph.id}
          </option>
        ))}
      </select>
    </Field>
  );

  switch (widget.type) {
    case 'heading':
      return (
        <>
          {text('eyebrow', 'Eyebrow', 'The small line above. Optional.')}
          {text('text', 'Heading')}
          <Field label="Level" hint="One h1 per page. Sections are h2.">
            <select
              className="vaSelect"
              value={String(p.level ?? 2)}
              onChange={(e) => setProp('level', Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  h{n}
                </option>
              ))}
            </select>
          </Field>
        </>
      );

    case 'text':
      return area('html', 'Text', 12, 'Basic HTML works: <p>, <strong>, <em>, <a href="…">, <ul><li>.');

    case 'mediaText':
      return (
        <>
          {text('eyebrow', 'Eyebrow')}
          {text('heading', 'Heading')}
          {area('html', 'Text', 8)}
          {photo('photoId', 'Photo')}
          {text('url', 'Or an image URL')}
          {text('alt', 'Alt text', 'What the photo shows, for screen readers.')}
          {text('caption', 'Caption')}
          <Field label="Photo goes">
            <select
              className="vaSelect"
              value={s('mediaSide', 'right')}
              onChange={(e) => setProp('mediaSide', e.target.value)}
            >
              <option value="right">Right of the text</option>
              <option value="left">Left of the text</option>
            </select>
          </Field>
          <Field label="Photo share of the row" hint={`${p.mediaWidth ?? 48}%`}>
            <input
              type="range"
              min={25}
              max={65}
              value={Number(p.mediaWidth ?? 48)}
              onChange={(e) => setProp('mediaWidth', Number(e.target.value))}
            />
          </Field>
          {text('buttonLabel', 'Button text', 'Leave blank for no button.')}
          {text('buttonHref', 'Button link')}
        </>
      );

    case 'hero':
      return (
        <>
          {text('eyebrow', 'Eyebrow')}
          {text('title', 'Big title')}
          {area('line', 'Supporting line', 3)}
          {photo('photoId', 'Background photo')}
          {photo('portraitPhotoId', 'Inset portrait')}
          {text('portraitCaption', 'Portrait caption')}
          <Toggle
            label="Show the inset portrait"
            checked={p.showPortrait !== false}
            onChange={(v) => setProp('showPortrait', v)}
          />
          <Field label="Height">
            <select className="vaSelect" value={s('height', 'tall')} onChange={(e) => setProp('height', e.target.value)}>
              <option value="tall">Tall</option>
              <option value="short">Short</option>
            </select>
          </Field>
          <ListEditor
            label="Buttons"
            items={(Array.isArray(p.buttons) ? p.buttons : []) as Record<string, string>[]}
            fields={[
              { key: 'label', label: 'Text' },
              { key: 'href', label: 'Link' },
            ]}
            onChange={(items) => setProp('buttons', items)}
          />
        </>
      );

    case 'image':
      return (
        <>
          {photo('photoId', 'Photo')}
          {text('url', 'Or an image URL')}
          {text('alt', 'Alt text')}
          {text('caption', 'Caption')}
        </>
      );

    case 'audio':
      return (
        <>
          {text('title', 'Track name')}
          {text('subtitle', 'Subtitle')}
          {text('url', 'Audio file URL')}
          <Toggle
            label="Allow download"
            checked={p.downloadable === true}
            onChange={(v) => setProp('downloadable', v)}
          />
        </>
      );

    case 'video':
      return (
        <>
          {text('url', 'Video file URL')}
          {text('poster', 'Poster image URL')}
          {text('caption', 'Caption')}
        </>
      );

    case 'embed':
      return (
        <>
          {text('url', 'Link', 'YouTube, Vimeo, SoundCloud, Spotify or Bandcamp.')}
          {text('title', 'Title, for screen readers')}
        </>
      );

    case 'button':
      return (
        <>
          {text('label', 'Text')}
          {text('href', 'Link')}
          <Field label="Look">
            <select
              className="vaSelect"
              value={s('variant', 'solid')}
              onChange={(e) => setProp('variant', e.target.value)}
            >
              <option value="solid">Solid</option>
              <option value="outline">Outline</option>
              <option value="ghost">Plain</option>
            </select>
          </Field>
        </>
      );

    case 'buttonRow':
      return (
        <ListEditor
          label="Buttons"
          items={(Array.isArray(p.buttons) ? p.buttons : []) as Record<string, string>[]}
          fields={[
            { key: 'label', label: 'Text' },
            { key: 'href', label: 'Link' },
            { key: 'variant', label: 'Look' },
          ]}
          onChange={(items) => setProp('buttons', items)}
        />
      );

    case 'quote':
      return (
        <>
          {area('text', 'Quote', 4)}
          {text('attribution', 'Who said it')}
          {text('role', 'Their role')}
        </>
      );

    case 'cta':
      return (
        <>
          {text('heading', 'Heading')}
          {area('body', 'Body', 4)}
          {text('buttonLabel', 'Button text')}
          {text('buttonHref', 'Button link')}
          {text('secondaryLabel', 'Second button text')}
          {text('secondaryHref', 'Second button link')}
        </>
      );

    case 'cards':
    case 'featureCards':
      return (
        <ListEditor
          label="Cards"
          items={(Array.isArray(p.items) ? p.items : []) as Record<string, string>[]}
          fields={[
            { key: 'title', label: 'Title' },
            { key: 'body', label: 'Body', multiline: true },
            { key: 'href', label: 'Link' },
            ...(widget.type === 'featureCards' ? [{ key: 'photoId', label: 'Photo id' }] : []),
          ]}
          onChange={(items) => setProp('items', items)}
        />
      );

    case 'steps':
      return (
        <ListEditor
          label="Steps"
          items={(Array.isArray(p.items) ? p.items : []) as Record<string, string>[]}
          fields={[
            { key: 'step', label: 'Number' },
            { key: 'title', label: 'Title' },
            { key: 'body', label: 'Body', multiline: true },
          ]}
          onChange={(items) => setProp('items', items)}
        />
      );

    case 'stats':
      return (
        <ListEditor
          label="Stats"
          items={(Array.isArray(p.items) ? p.items : []) as Record<string, string>[]}
          fields={[
            { key: 'value', label: 'Number' },
            { key: 'label', label: 'Label' },
          ]}
          onChange={(items) => setProp('items', items)}
        />
      );

    case 'specList':
      return (
        <>
          {text('title', 'Title')}
          <ListEditor
            label="Rows"
            items={(Array.isArray(p.rows) ? p.rows : []) as Record<string, string>[]}
            fields={[
              { key: 'label', label: 'Label' },
              { key: 'value', label: 'Value', multiline: true },
            ]}
            onChange={(items) => setProp('rows', items)}
          />
        </>
      );

    case 'faq':
      return (
        <ListEditor
          label="Questions"
          items={(Array.isArray(p.items) ? p.items : []) as Record<string, string>[]}
          fields={[
            { key: 'q', label: 'Question' },
            { key: 'a', label: 'Answer', multiline: true },
          ]}
          onChange={(items) => setProp('items', items)}
        />
      );

    case 'gallery':
      return (
        <ListEditor
          label="Photos"
          items={(Array.isArray(p.items) ? p.items : []) as Record<string, string>[]}
          fields={[
            { key: 'photoId', label: 'Photo id' },
            { key: 'alt', label: 'Alt text' },
            { key: 'caption', label: 'Caption' },
          ]}
          onChange={(items) => setProp('items', items)}
        />
      );

    // ── Bound widgets: these configure a query, not content. ──
    case 'demoReels':
      return (
        <>
          <Field label="Which reels" hint="These come from Demo reels in the studio.">
            <select className="vaSelect" value={s('category', 'all')} onChange={(e) => setProp('category', e.target.value)}>
              {['all', 'commercial', 'telephony', 'narration', 'character', 'promo', 'singing'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <NumberField label="How many" value={Number(p.limit ?? 4)} min={1} max={12} onChange={(v) => setProp('limit', v)} />
          <Toggle label="Allow download" checked={p.downloadable === true} onChange={(v) => setProp('downloadable', v)} />
        </>
      );

    case 'projectGrid':
      return (
        <>
          <Field label="Which projects">
            <select className="vaSelect" value={s('filter', 'all')} onChange={(e) => setProp('filter', e.target.value)}>
              <option value="all">All published</option>
              <option value="featured">Featured only</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
            </select>
          </Field>
          <NumberField label="How many" value={Number(p.limit ?? 6)} min={1} max={24} onChange={(v) => setProp('limit', v)} />
          <NumberField label="Columns" value={Number(p.columns ?? 3)} min={1} max={4} onChange={(v) => setProp('columns', v)} />
        </>
      );

    case 'testimonials':
      return (
        <>
          <Field label="Which testimonials">
            <select className="vaSelect" value={s('context', 'all')} onChange={(e) => setProp('context', e.target.value)}>
              <option value="all">All</option>
              <option value="voice">Voice-over only</option>
              <option value="coaching">Coaching only</option>
            </select>
          </Field>
          <NumberField label="How many" value={Number(p.limit ?? 4)} min={1} max={12} onChange={(v) => setProp('limit', v)} />
        </>
      );

    case 'packages':
      return (
        <Toggle
          label="Show what is included"
          checked={p.showInclusions !== false}
          onChange={(v) => setProp('showInclusions', v)}
        />
      );

    case 'creditsList':
      return (
        <Field label="Which credits">
          <select className="vaSelect" value={s('creditType', 'all')} onChange={(e) => setProp('creditType', e.target.value)}>
            {['all', 'stage', 'voice', 'music', 'education', 'award'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      );

    case 'contactForm':
      return (
        <>
          {text('heading', 'Heading above the form')}
          <Field label="Starts on">
            <select className="vaSelect" value={s('intent', 'voiceover')} onChange={(e) => setProp('intent', e.target.value)}>
              <option value="voiceover">Voice over</option>
              <option value="coaching">Coaching</option>
              <option value="booking">Live booking</option>
              <option value="other">Something else</option>
            </select>
          </Field>
        </>
      );

    case 'divider':
      return (
        <Field label="Style">
          <select className="vaSelect" value={s('variant', 'ornament')} onChange={(e) => setProp('variant', e.target.value)}>
            <option value="ornament">Ornament</option>
            <option value="rule">Plain rule</option>
          </select>
        </Field>
      );

    case 'spacer':
      return <NumberField label="Height" value={Number(p.height ?? 6)} min={1} max={20} onChange={(v) => setProp('height', v)} />;

    default:
      return <p className="vaMuted" style={{ fontSize: '0.875rem' }}>This block has no content settings.</p>;
  }
}

// ── Small controls ───────────────────────────────────────────────────────────────────────────────

function Group({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="vaInspectorGroup">
      <p className="vaInspectorGroupTitle">{title}</p>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  overridden,
  onReset,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  overridden?: boolean;
  onReset?: () => void;
}): React.ReactElement {
  return (
    <div className="vaInspectorField">
      <div className="vaInspectorLabelRow">
        <label className="vaInspectorLabel">
          {label}
          {/* A dot, not a word. It has to be scannable down a column of fifteen controls. */}
          {overridden && <span className="vaOverrideDot" title="Changed for phones" />}
        </label>
        {overridden && onReset && (
          <button type="button" className="vaResetBtn" onClick={onReset} title="Match desktop again">
            <RotateCcw size={11} aria-hidden />
          </button>
        )}
      </div>
      {children}
      {hint && <p className="vaInspectorHint">{hint}</p>}
    </div>
  );
}

function Slider({
  label,
  value,
  min = 0,
  max,
  step = 1,
  display,
  onChange,
  overridden,
  onReset,
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  step?: number;
  display: string;
  onChange: (value: number) => void;
  overridden?: boolean;
  onReset?: () => void;
}): React.ReactElement {
  return (
    <Field label={`${label} — ${display}`} overridden={overridden} onReset={onReset}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="vaRange"
      />
    </Field>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
  overridden,
  onReset,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  overridden?: boolean;
  onReset?: () => void;
}): React.ReactElement {
  return (
    <Field label={label} overridden={overridden} onReset={onReset}>
      <select className="vaSelect" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}): React.ReactElement {
  return (
    <div className="vaInspectorField">
      <label className="vaCheckRow" style={{ marginBottom: hint ? 4 : 0 }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span style={{ fontSize: '0.8125rem', color: 'var(--va-text)' }}>{label}</span>
      </label>
      {hint && <p className="vaInspectorHint">{hint}</p>}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}): React.ReactElement {
  return (
    <Field label={label}>
      <input
        type="number"
        className="vaInput"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
      />
    </Field>
  );
}

/** Colour: theme tokens first, a picker second.
 *
 *  The tokens are listed above the free picker deliberately. A widget styled with `surface` FOLLOWS
 *  the site theme when Andrew changes it; one styled `#141A26` stays dark forever and becomes a black
 *  hole in the middle of a light page. Putting the tokens first is the difference between a theme
 *  picker that keeps working and one that stops after a month of editing. */
function ColorPick({
  label,
  value,
  onChange,
  overridden,
  onReset,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  overridden?: boolean;
  onReset?: () => void;
}): React.ReactElement {
  const isToken = value !== null && (COLOR_TOKENS as readonly string[]).includes(value);
  return (
    <Field label={label} overridden={overridden} onReset={onReset}>
      <select
        className="vaSelect"
        value={value === null ? '' : isToken ? value : '__custom'}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') onChange(null);
          else if (v === '__custom') onChange('#D9B65B');
          else onChange(v);
        }}
      >
        <option value="">Follow the theme</option>
        {COLOR_TOKENS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
        <option value="__custom">Pick a colour…</option>
      </select>
      {value !== null && !isToken && (
        <input
          type="color"
          className="vaColorInput"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#D9B65B'}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

/** A repeatable list of small records — cards, buttons, FAQ pairs, spec rows.
 *
 *  Deliberately plain: add, remove, move, and text fields. A drag-reorder here would be nicer and is
 *  not worth the complexity for lists that are almost always three to six items long. */
function ListEditor({
  label,
  items,
  fields,
  onChange,
}: {
  label: string;
  items: Record<string, string>[];
  fields: { key: string; label: string; multiline?: boolean }[];
  onChange: (items: Record<string, string>[]) => void;
}): React.ReactElement {
  const update = (index: number, key: string, value: string): void => {
    const next = items.map((item, i) => (i === index ? { ...item, [key]: value } : item));
    onChange(next);
  };

  return (
    <div className="vaInspectorGroup">
      <p className="vaInspectorGroupTitle">{label}</p>
      {items.map((item, index) => (
        <div key={index} className="vaListItem">
          <div className="vaListItemHead">
            <span>#{index + 1}</span>
            <span style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={() => {
                  if (index === 0) return;
                  const next = items.slice();
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  onChange(next);
                }}
                disabled={index === 0}
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => {
                  if (index === items.length - 1) return;
                  const next = items.slice();
                  [next[index + 1], next[index]] = [next[index], next[index + 1]];
                  onChange(next);
                }}
                disabled={index === items.length - 1}
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                aria-label="Remove"
                style={{ color: '#ff9c7e' }}
              >
                ✕
              </button>
            </span>
          </div>
          {fields.map((field) =>
            field.multiline ? (
              <textarea
                key={field.key}
                className="vaTextarea"
                rows={3}
                placeholder={field.label}
                value={item[field.key] ?? ''}
                onChange={(e) => update(index, field.key, e.target.value)}
              />
            ) : (
              <input
                key={field.key}
                className="vaInput"
                placeholder={field.label}
                value={item[field.key] ?? ''}
                onChange={(e) => update(index, field.key, e.target.value)}
              />
            ),
          )}
        </div>
      ))}
      <button
        type="button"
        className="vaBtn vaBtnOutline vaBtnSm"
        onClick={() => onChange([...items, Object.fromEntries(fields.map((f) => [f.key, '']))])}
      >
        Add one
      </button>
    </div>
  );
}
