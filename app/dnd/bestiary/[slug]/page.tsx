// /dnd/bestiary/[slug] — one creature, in full.
//
// SLICE B1-1/B1-2. The stat block is interactive (its attacks roll through the shared feed) and the aura animates
// here, where it is one creature rather than sixty and can afford to.
//
// PROVENANCE IS PRINTED, not buried. `source`, `licence` and `attribution` are NOT NULL on the table because the
// licences that let us carry this content require the attribution to travel with it. A catalogue page that omits it
// is not merely impolite, it is out of compliance — so it renders as part of the page rather than as a tooltip.
//
// BOTH OWNER-ASKED ACTIONS ARE LIVE. "Use in a campaign" (B3-3) is the same SendCreatureToFight the Studio
// uses, pointed at a catalogue row, so a DM never re-types a monster HP. "Make my own version" (B3-1b) FORKS
// the creature into a Studio piece rather than editing the catalogue (G1) — which is what makes it shareable
// and adoptable with no new machinery, since homebrew already has all of that.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import styles from '@/app/dnd/_ui/hextech.module.css';
import { loadCreature, loadSiblings } from '@/lib/dnd/bestiary/query';
import { TAG_LABELS, type CreatureTag } from '@/lib/dnd/bestiary/taxonomy';
import { auraFor } from '@/lib/dnd/bestiary/aura';
import { planeFor } from '@/lib/dnd/bestiary/planes';
import { GAME_SYSTEMS, DEFAULT_SYSTEM } from '@/lib/dnd/systems';
import CreatureAura from '@/app/dnd/_ui/bestiary/CreatureAura';
import SystemLens from '@/app/dnd/_ui/bestiary/SystemLens';
import VariantCarousel from '@/app/dnd/_ui/bestiary/VariantCarousel';
import type { BestiarySystem } from '@/lib/dnd/bestiary/transpose';
import SendCreatureToFight from '@/app/dnd/_ui/SendCreatureToFight';
import ForkCreature from '@/app/dnd/_ui/bestiary/ForkCreature';
import CreatureArtUpload from '@/app/dnd/_ui/bestiary/CreatureArtUpload';
import { getDndSession, isDndOwner } from '@/lib/dnd/auth';

export const dynamic = 'force-dynamic';

/**
 * A creature's slug carries a source prefix — `srd51:wolf` — so the same creature from two editions stays two rows.
 * The colon does not survive the round trip through a URL path segment intact, and the detail page 404'd on every
 * creature until this existed: the row was there, the lookup was correct, and the string arriving at the page was
 * percent-encoded. Decoding is unconditional because `decodeURIComponent` leaves an already-decoded slug alone.
 */
function creatureSlugFromParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    // A malformed escape sequence is a bad URL, not a server error — fall through to the raw value, which will
    // simply not match and render the not-found page.
    return raw;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = await loadCreature(creatureSlugFromParam(slug));
  return { title: found ? `${found.creature.name} | Bestiary` : 'Bestiary | Starr Tabletop' };
}

const systemName = (key: string) => GAME_SYSTEMS.find((s) => s.key === key)?.name ?? key;

export default async function CreaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await loadCreature(creatureSlugFromParam(slug));
  if (!found) notFound();
  const { creature: c, variants } = found;
  const aura = auraFor(c);
  // A picture on a catalogue row is what EVERY reader sees, so setting it is not a per-user preference.
  // Anyone else who wants their own art forks the creature and gives their copy a picture in the Studio.
  const canEditArt = isDndOwner(getDndSession());
  const plane = planeFor(c);

  // N7 — the same creature as other systems already publish it. A designer's numbers for a system beat
  // any measurement of ours, so the lens prefers these and only derives where none exists. Matched on the
  // creature's NAME within the other systems: the catalogue's slugs carry their source book
  // (`pf2b3:skunk`, `tob2:alchemical-skunk`), so a slug is not an identity across systems and the name is
  // the only thing two books share. Deliberately narrow — an exact, case-insensitive name match, so
  // "Badger" never picks up "Giant Badger".
  const siblings = await loadSiblings(c.name, c.system);

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 900, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div>
            <Link className={styles.hexBtn} href="/dnd/bestiary" style={{ marginBottom: 10 }}>← Bestiary</Link>
          </div>

          <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 14 }}>
            <div className={styles.framedPanelTop} />

            {/* Portrait beside the identity line, collapsing to stacked on a phone. `minmax(0, 1fr)` on the text
                column, because an undeclared grid column is implicit `auto` and sizes to MIN-CONTENT — which makes
                a long creature name push the layout wider than its container instead of wrapping. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <CreatureAura creature={c} size={168} />
                <div style={{ display: 'grid', gap: 4, flex: '1 1 240px', minWidth: 0 }}>
                  <h1 className={styles.title} style={{ textAlign: 'left', margin: 0 }}>{c.name}</h1>
                  <p style={{ margin: 0, color: 'var(--hx-muted)', fontStyle: 'italic' }}>
                    {[c.size, c.type, c.alignment].filter(Boolean).join(' ') || systemName(c.system)}
                  </p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--hx-teal-1)', border: '1px solid var(--hx-line)', borderRadius: 999, padding: '1px 8px' }}>
                      {systemName(c.system)}
                    </span>
                    {c.cr && (
                      <span style={{ fontSize: 11, color: 'var(--hx-gold-2)', border: '1px solid var(--hx-line)', borderRadius: 999, padding: '1px 8px' }}>
                        CR {c.cr}
                      </span>
                    )}
                    {c.tags.map((t) => (
                      <Link
                        key={t}
                        href={`/dnd/bestiary?tag=${encodeURIComponent(t)}`}
                        style={{ fontSize: 11, color: 'var(--hx-muted)', border: '1px solid var(--hx-line)', borderRadius: 999, padding: '1px 8px', textDecoration: 'none' }}
                      >
                        {TAG_LABELS[t as CreatureTag] ?? t}
                      </Link>
                    ))}
                  </div>
                  {/* What its aura is meant to convey — visible so a reader can tell us when it is wrong, which is
                      the only way a derived effect gets corrected. */}
                  <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--hx-muted)' }}>Aura: {aura.feel}</p>
                  {/* B5-2. Shown with its BASIS, because "The Lower Planes" on its own reads as something
                      we decided — where "Fiends are defined as natives of the Lower Planes" is a rule a
                      reader can check. Absent for most creatures, which is correct: a wolf has no plane of
                      origin and inventing one is the failure this is designed around. */}
                  {plane && (
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--hx-muted)' }}>
                      Plane:{' '}
                      <Link href={`/dnd/bestiary?plane=${encodeURIComponent(plane.key)}`} style={{ color: 'var(--hx-teal-1)' }}>
                        {plane.label}
                      </Link>
                      <span style={{ opacity: 0.75 }}> — {plane.basis}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Rendered paragraph by paragraph, because the description is AUTHORED with structure and a
                  single <p> throws it away. A transposed creature's prose ends with the list of numbers the
                  conversion could not honestly carry ("• AC 10 was carried over unchanged…") — the one part
                  of the page a DM must not scroll past — and collapsed into running text it read as a wall
                  nobody finishes. Bullets keep their hanging indent so the list looks like a list. */}
              {c.description && (
                <div style={{ display: 'grid', gap: 8 }}>
                  {c.description.split(/\n{2,}/).map((para, i) => {
                    const lines = para.split('\n').filter((l) => l.trim());
                    const bullets = lines.filter((l) => l.trim().startsWith('•'));
                    // A paragraph counts as a list only when every line but a leading lead-in is a bullet,
                    // so ordinary prose that happens to contain a • is left alone.
                    if (bullets.length && bullets.length >= lines.length - 1) {
                      const lead = lines[0].trim().startsWith('•') ? null : lines[0];
                      return (
                        <div key={i} style={{ display: 'grid', gap: 4 }}>
                          {lead && <p style={{ margin: 0 }}>{lead}</p>}
                          {/* `listStyleType` is set explicitly because the app's CSS reset clears it, and a
                              bulleted list with no bullets is just indented prose. */}
                          <ul style={{ margin: 0, paddingLeft: 20, listStyleType: 'disc', display: 'grid', gap: 4 }}>
                            {bullets.map((b, j) => (
                              <li key={j} style={{ margin: 0 }}>{b.replace(/^\s*•\s*/, '')}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    }
                    return <p key={i} style={{ margin: 0 }}>{para}</p>;
                  })}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {/* B3-3, live: the same control the Studio uses, pointed at a catalogue row. Name, art and
                    HP come across from the stat block, so a DM never re-types a monster's HP. */}
                <SendCreatureToFight source={{ creatureId: c.id }} />
                {/* B3-1b, live: forking copies the creature into your own Studio piece (the catalogue stays
                    immutable, G1), which is where sharing and adoption already work. */}
                <ForkCreature
                  creatureId={c.id}
                  variants={variants.map((v) => ({ id: v.id, name: v.name, tier: v.tier }))}
                />
              </div>

              {/* B6-6. Rendered only for the catalogue owner — and rendered at all only because the
                  automated art pipeline provably cannot finish: species queries are reliable, fantasy
                  names are not, and no tuning fixes that (B6-5). */}
              {canEditArt && (
                <CreatureArtUpload creatureId={c.id} creatureName={c.name} hasImage={Boolean(c.imageUrl)} />
              )}
            </div>
          </section>

          {/* N3-3 — the LENS. The system control is the stat block's header, because it says what the
              numbers below it are. Switching re-derives in place (deriveNativeStatblock is pure), which is
              what the owner's "dynamic in real time" asks for, and it REPLACED the old "Use in another
              system" panel rather than joining it — two controls answering the same question can disagree,
              and a header saying Pathfinder above a panel showing 5e is worse than either alone. */}
          <section className={styles.framedPanel} style={{ padding: '14px 16px' }}>
            <div className={styles.framedPanelTop} />
            <h2 className={styles.panelTitle} style={{ marginTop: 0 }}>Stat block</h2>
            <SystemLens
              source={{ name: c.name, system: c.system, type: c.type, size: c.size, cr: c.cr, statblock: c.statblock }}
              published={siblings}
              initial={DEFAULT_SYSTEM as BestiarySystem}
            />
          </section>

          {/* N3-5 — the variant CAROUSEL, beneath the stat block, with every difference noted.
              Replaces a stack of collapsed <details> whose only account of what changed was the
              derivation SENTENCE: a claim about what a formula intended rather than a record of what it
              did. VariantCarousel computes the diff from the two blocks instead. */}
          {variants.length > 0 && (
            <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 12 }}>
              <div className={styles.framedPanelTop} />
              <h2 className={styles.panelTitle} style={{ margin: 0 }}>Versions of this creature</h2>
              <VariantCarousel
                baseName={c.name}
                baseCr={c.cr}
                baseStatblock={c.statblock}
                variants={variants}
                system={c.system}
              />
            </section>
          )}


          {/* The attribution the licence requires. Small, but present on every page that carries the content. */}
          <p style={{ fontSize: 11, color: 'var(--hx-muted)', margin: 0 }}>
            {c.source}
            {c.licence ? ` · ${c.licence}` : ''}
            {c.attribution ? ` · ${c.attribution}` : ''}
            {c.sourceUrl ? (
              <>
                {' · '}
                <a href={c.sourceUrl} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--hx-teal-1)' }}>source</a>
              </>
            ) : null}
          </p>

          {/* THE PICTURE'S OWN CREDIT, which is a different work by a different author under a different
              licence — seed 467 added the columns for exactly that reason and the page never printed them.
              For the 477 creatures with art that was a licence CONDITION met in the database and unmet in
              the only place it counts: CC-BY and CC-BY-SA require the credit to travel with the image, and
              an image on a publicly-reachable page is published. Labelled "Illustration" so a reader can
              tell it apart from the stat block's line directly above it. */}
          {c.imageUrl && c.imageAttribution && (
            <p style={{ fontSize: 11, color: 'var(--hx-muted)', margin: 0 }}>
              Illustration: {c.imageAttribution}
              {c.imageLicence ? ` · ${c.imageLicence}` : ''}
              {c.imageSourceUrl ? (
                <>
                  {' · '}
                  <a href={c.imageSourceUrl} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--hx-teal-1)' }}>
                    image source
                  </a>
                </>
              ) : null}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
