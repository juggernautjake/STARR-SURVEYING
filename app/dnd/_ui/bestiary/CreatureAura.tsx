// CreatureAura — a creature's portrait with its own atmosphere around it.
//
// Owner: *"Put cool effects around their pictures, and change the effects up depending on the kind of creature."*
// `auraFor` decides what the effect IS (see the reasoning there for why it is derived per kind rather than authored
// per creature); this draws it.
//
// A SERVER COMPONENT, deliberately: CSS and SVG only, no hooks, no hydration. The list view renders sixty of these,
// and sixty client components with sixty animation loops would make browsing the bestiary the most expensive page
// in the app. Everything here is declarative — the browser animates it without any of our code running.
//
// `still` DROPS THE MOTION for list views. Sixty animated auras at once is visual noise and real compositing cost;
// the tint alone still tells you a zombie from a rabbit at a glance, and the detail page is where the effect earns
// its keep.
import { auraFor, sigilFor, type AuraInput } from '@/lib/dnd/bestiary/aura';
import styles from './aura.module.css';

export interface CreatureAuraProps {
  creature: AuraInput & { slug: string; imageUrl?: string | null };
  /** Rendered size in px, square. */
  size?: number;
  /** True in list views: keep the colour, drop the animation. */
  still?: boolean;
}

export default function CreatureAura({ creature, size = 160, still = false }: CreatureAuraProps) {
  const aura = auraFor(creature);
  const sigil = sigilFor(creature.slug);

  // The aura's numbers reach CSS as custom properties, so one stylesheet covers every creature and a new aura is
  // data rather than a new rule.
  const vars = {
    '--aura-rgb': aura.rgb,
    '--aura-rgb-2': aura.rgb2,
    '--aura-intensity': String(aura.intensity),
    '--aura-density': String(aura.density),
    width: size,
    height: size,
  } as React.CSSProperties;

  return (
    <div
      className={`${styles.aura} ${styles[`motion-${aura.motion}`] ?? ''} ${still ? styles.still : ''} ${aura.boss ? styles.boss : ''}`}
      style={vars}
      // The feel is the title text, which doubles as the reason a reader can tell us it is wrong.
      title={`${creature.name} — ${aura.feel}`}
    >
      <span className={styles.wash} aria-hidden />
      <span className={styles.motes} aria-hidden />

      {creature.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.portrait} src={creature.imageUrl} alt={creature.name} loading="lazy" />
      ) : (
        // NO BROKEN IMAGES, EVER. Monster art is largely unlicensable, so a missing portrait is the normal case
        // rather than an error — and a deterministic emblem plus the aura reads as a design decision, which it is.
        <svg className={styles.sigil} viewBox="0 0 100 100" aria-hidden>
          <g transform={`rotate(${sigil.rotation} 50 50)`}>
            <polygon
              className={styles.sigilShape}
              points={Array.from({ length: sigil.points }, (_, i) => {
                const a = -Math.PI / 2 + (i * 2 * Math.PI) / sigil.points;
                return `${(50 + 30 * Math.cos(a)).toFixed(1)},${(50 + 30 * Math.sin(a)).toFixed(1)}`;
              }).join(' ')}
            />
            <circle className={styles.sigilRing} cx="50" cy="50" r={sigil.ring * 44} />
          </g>
          {/* The initial, so a wall of sigils is still scannable by name. */}
          <text className={styles.sigilLetter} x="50" y="52" textAnchor="middle" dominantBaseline="central">
            {creature.name.slice(0, 1).toUpperCase()}
          </text>
        </svg>
      )}

      <span className={styles.frame} aria-hidden />
    </div>
  );
}
