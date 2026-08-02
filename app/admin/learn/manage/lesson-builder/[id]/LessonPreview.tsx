'use client';
// app/admin/learn/manage/lesson-builder/[id]/LessonPreview.tsx — the lesson as a student sees it.
//
// Lifted out of page.tsx for platform audit item 18. This is the read half of the builder: the
// same 23 block types, rendered without a single editing affordance. It was the last part of that
// file that could come out as a unit — what remains there is the editor, where the per-type forms
// are woven into the same map as the drag handles and the row grouping.
//
// Its props are the preview's own interactive state (which slide, which accordion section, which
// collapsed block), which stays in the page because the toolbar above the preview reads it too.

import React, { type Dispatch, type SetStateAction } from 'react';
import {
  Calculator, Check, ChevronDown, FileText, Globe, HelpCircle, Paperclip, Target, X,
} from 'lucide-react';
import Image from 'next/image';
import { renderMath } from '@/lib/learn/math';
import { convertToEmbedUrl, formatFileSize, renderLatex, type LessonBlock } from './blocks';

/** Everything the preview needs, and nothing it does not.
 *
 *  The interactive state — which slide, which tab, which card is flipped, which quiz has been
 *  answered — stays OWNED by the page. Toggling to Edit and back must not silently reset a
 *  reviewer's place, and the toolbar above the preview reads some of it. So it arrives as props
 *  rather than being re-declared here: two copies of "which flashcard is showing" is a bug waiting
 *  for the first person who edits a block while previewing it. */
export interface LessonPreviewProps {
  blocks: LessonBlock[];
  /** Row grouping is written by the editor, so the preview is handed the function rather than
   *  re-deriving the grouping and disagreeing with the page about it. */
  getBlockRows: (blockList: LessonBlock[]) => { rowGroup: string | null; blocks: LessonBlock[] }[];
  /** dangerouslySetInnerHTML with the unicode-escape decoding the seeded lessons need. */
  dhtml: (html: string) => { __html: string };
  slideshowIndexes: Record<string, number>;
  slideshowNav: (blockId: string, dir: 'prev' | 'next', total: number) => void;
  collapsedBlocks: Record<string, boolean>;
  setCollapsedBlocks: Dispatch<SetStateAction<Record<string, boolean>>>;
  flippedCards: Record<string, boolean>;
  setFlippedCards: Dispatch<SetStateAction<Record<string, boolean>>>;
  expandedPopups: Record<string, boolean>;
  setExpandedPopups: Dispatch<SetStateAction<Record<string, boolean>>>;
  flashcardIndexes: Record<string, number>;
  setFlashcardIndexes: Dispatch<SetStateAction<Record<string, number>>>;
  quizAnswers: Record<string, number | null>;
  setQuizAnswers: Dispatch<SetStateAction<Record<string, number | null>>>;
  quizRevealed: Record<string, boolean>;
  setQuizRevealed: Dispatch<SetStateAction<Record<string, boolean>>>;
  previewTabIndexes: Record<string, number>;
  setPreviewTabIndexes: Dispatch<SetStateAction<Record<string, number>>>;
  previewAccordionOpen: Record<string, boolean>;
  setPreviewAccordionOpen: Dispatch<SetStateAction<Record<string, boolean>>>;
}

export default function LessonPreview({
  blocks, getBlockRows, dhtml,
  slideshowIndexes, slideshowNav,
  collapsedBlocks, setCollapsedBlocks,
  flippedCards, setFlippedCards,
  expandedPopups, setExpandedPopups,
  flashcardIndexes, setFlashcardIndexes,
  quizAnswers, setQuizAnswers,
  quizRevealed, setQuizRevealed,
  previewTabIndexes, setPreviewTabIndexes,
  previewAccordionOpen, setPreviewAccordionOpen,
}: LessonPreviewProps) {
  return (
        <div className="lesson__body">
          {getBlockRows(blocks).map((row, rowIdx) => {
            const isRowGroup = row.rowGroup && row.blocks.length > 1;
            const rowContent = row.blocks.map((block) => {
            const blockWrapStyle: React.CSSProperties = {};
            if (block.style?.backgroundColor && block.style.backgroundColor !== '#ffffff') blockWrapStyle.backgroundColor = block.style.backgroundColor;
            if (block.style?.borderColor && block.style?.borderWidth) { blockWrapStyle.border = `${block.style.borderWidth}px solid ${block.style.borderColor}`; }
            if (block.style?.borderRadius !== undefined) blockWrapStyle.borderRadius = `${block.style.borderRadius}px`;
            if (block.style?.boxShadow && block.style.boxShadow !== 'none') {
              const shadows: Record<string, string> = { sm: '0 1px 3px rgba(0,0,0,.1)', md: '0 4px 12px rgba(0,0,0,.1)', lg: '0 8px 24px rgba(0,0,0,.12)', xl: '0 16px 40px rgba(0,0,0,.15)' };
              blockWrapStyle.boxShadow = shadows[block.style.boxShadow] || 'none';
            }
            if (block.style?.width && block.style.width !== 'full') {
              const widths: Record<string, string> = { wide: '80%', half: '50%', third: '33%' };
              blockWrapStyle.maxWidth = widths[block.style.width]; blockWrapStyle.margin = '0 auto';
            }
            if (Object.keys(blockWrapStyle).length > 0) { blockWrapStyle.padding = blockWrapStyle.padding || '1rem'; blockWrapStyle.marginBottom = '1rem'; }
            const isCollapsible = block.style?.collapsible;
            const isHidden = block.style?.hidden;
            const isCollapsed = collapsedBlocks[block.id] ?? true;
            if (isHidden && isCollapsed) {
              return (
                <div key={block.id} style={{ textAlign: 'center', margin: '1rem 0' }}>
                  <button className="admin-btn admin-btn--ghost" onClick={() => setCollapsedBlocks(prev => ({ ...prev, [block.id]: false }))} style={{ fontSize: '.85rem' }}>
                    {block.style?.hiddenLabel || 'Click to reveal'}
                  </button>
                </div>
              );
            }
            return (
            <div key={block.id} style={blockWrapStyle}>
              {isCollapsible && (
                <button className="lesson-builder__collapse-toggle" onClick={() => setCollapsedBlocks(prev => ({ ...prev, [block.id]: !isCollapsed }))}>
                  <span style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)', display: 'inline-block', transition: 'transform .2s' }}><ChevronDown size={14} strokeWidth={2.5} /></span>
                  {' '}{block.style?.collapsedLabel || block.block_type}
                </button>
              )}
              <div className={`block-collapsible-wrap ${(!isCollapsible || !isCollapsed) ? 'block-collapsible-wrap--open' : ''}`}><div>
              {block.block_type === 'text' && block.content.html && block.content.html !== '<p></p>' && (
                <div dangerouslySetInnerHTML={dhtml(block.content.html)} />
              )}
              {block.block_type === 'text' && (!block.content.html || block.content.html === '<p></p>') && (
                <p style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Empty text block (will not render in published view)</p>
              )}
              {block.block_type === 'image' && block.content.url && (
                <figure style={{ textAlign: (block.content.alignment || 'center') as any, margin: '1.5rem 0' }}>
                  <Image src={block.content.url} alt={block.content.alt || ''} width={600} height={400} unoptimized style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px' }} />
                  {block.content.caption && <figcaption style={{ fontSize: '0.82rem', color: 'var(--color-text-tertiary)', marginTop: '0.5rem' }}>{block.content.caption}</figcaption>}
                </figure>
              )}
              {block.block_type === 'video' && block.content.url && (
                <div style={{ margin: '1.5rem 0' }}>
                  <iframe src={convertToEmbedUrl(block.content.url)} style={{ width: '100%', aspectRatio: '16/9', border: 'none', borderRadius: '8px' }} allowFullScreen />
                  {block.content.caption && <p style={{ fontSize: '0.82rem', color: 'var(--color-text-tertiary)', marginTop: '0.5rem', textAlign: 'center' }}>{block.content.caption}</p>}
                </div>
              )}
              {block.block_type === 'callout' && (
                <div className={`lesson-builder__callout lesson-builder__callout--${block.content.type || 'info'}`}>
                  <span dangerouslySetInnerHTML={dhtml(block.content.text)} />
                </div>
              )}
              {block.block_type === 'highlight' && (() => {
                const items = block.content.items || (block.content.text ? [{ text: block.content.text, style: block.content.style || 'blue' }] : []);
                return (
                  <div className="block-highlight-group">
                    {items.map((item: any, i: number) => (
                      <div key={i} className={`block-highlight block-highlight--${item.style || 'blue'}`}>
                        <span dangerouslySetInnerHTML={dhtml(item.text)} />
                      </div>
                    ))}
                  </div>
                );
              })()}
              {block.block_type === 'key_takeaways' && (
                <div className="block-takeaways">
                  <h4 className="block-takeaways__title">{block.content.title || 'Key Takeaways'}</h4>
                  <ul className="block-takeaways__list">
                    {(block.content.items || []).map((item: string, i: number) => (
                      <li key={i} className="block-takeaways__item">{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {block.block_type === 'equation' && (
                <div className={`lesson-builder__equation ${block.content.display === 'inline' ? 'lesson-builder__equation--inline' : ''}`}>
                  <div className="lesson-builder__equation-rendered" dangerouslySetInnerHTML={dhtml(renderLatex(block.content.latex || ''))} />
                  {block.content.label && <div className="lesson-builder__equation-label">{block.content.label}</div>}
                </div>
              )}
              {block.block_type === 'tabs' && (
                <div className="block-tabs">
                  <div className="block-tabs__header">
                    {(block.content.tabs || []).map((tab: any, ti: number) => (
                      <button key={ti} className={`block-tabs__tab ${(previewTabIndexes[block.id] ?? 0) === ti ? 'block-tabs__tab--active' : ''}`} onClick={() => setPreviewTabIndexes(prev => ({ ...prev, [block.id]: ti }))}>{tab.title || `Tab ${ti + 1}`}</button>
                    ))}
                  </div>
                  <div className="block-tabs__content" dangerouslySetInnerHTML={dhtml((block.content.tabs || [])[previewTabIndexes[block.id] ?? 0]?.content)} />
                </div>
              )}
              {block.block_type === 'accordion' && (
                <div className="block-accordion">
                  {(block.content.sections || []).map((sec: any, si: number) => {
                    const key = `${block.id}-${si}`;
                    const isOpen = previewAccordionOpen[key] ?? sec.open;
                    return (
                      <div key={si} className="block-accordion__section">
                        <button className="block-accordion__header" onClick={() => setPreviewAccordionOpen(prev => ({ ...prev, [key]: !isOpen }))}>
                          <span className="block-accordion__arrow">{isOpen ? '▾' : '▸'}</span>
                          <span className="block-accordion__title">{sec.title || `Section ${si + 1}`}</span>
                        </button>
                        {isOpen && <div className="block-accordion__content" dangerouslySetInnerHTML={dhtml(sec.content)} />}
                      </div>
                    );
                  })}
                </div>
              )}
              {block.block_type === 'columns' && (
                <div className="block-columns" style={{ gridTemplateColumns: `repeat(${block.content.columnCount || 2}, 1fr)` }}>
                  {(block.content.columns || []).map((col: any, ci: number) => (
                    <div key={ci} className="block-columns__col" dangerouslySetInnerHTML={dhtml(col.html)} />
                  ))}
                </div>
              )}
              {block.block_type === 'practice_problem' && (
                <div className="block-practice">
                  <div className="block-practice__header">
                    <span className="block-practice__icon"><Calculator size={18} strokeWidth={1.75} /></span>
                    <div>
                      <h4 className="block-practice__title">{block.content.title || 'Practice Problem'}</h4>
                      {block.content.category && <span className="block-practice__cat">{block.content.category}</span>}
                      {block.content.difficulty && <span className={`manage__diff-badge manage__diff-badge--${block.content.difficulty}`}>{block.content.difficulty}</span>}
                    </div>
                  </div>
                  {block.content.problem_statement && <div className="block-practice__statement">{block.content.problem_statement}</div>}
                  <div className="block-practice__steps">
                    {(block.content.steps || []).map((step: any, si: number) => (
                      <div key={si} className="block-practice__step">
                        <span className="block-practice__step-num">{si + 1}</span>
                        <div>
                          <strong>{step.label}</strong>
                          {step.content && <p style={{ margin: '.25rem 0 0', fontSize: '.85rem', color: '#374151' }}>{step.content}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {block.content.final_answer && (
                    <div className="block-practice__answer">
                      <strong>Answer:</strong> {block.content.final_answer}
                    </div>
                  )}
                </div>
              )}
              {block.block_type === 'divider' && <hr style={{ border: 'none', borderTop: '2px solid #E5E7EB', margin: '2rem 0' }} />}
              {block.block_type === 'embed' && block.content.url && (
                <iframe src={block.content.url} style={{ width: '100%', height: `${block.content.height || 400}px`, border: 'var(--border-light)', borderRadius: '8px', margin: '1.5rem 0' }} />
              )}
              {block.block_type === 'table' && (
                <div style={{ overflowX: 'auto', margin: '1.5rem 0' }}>
                  <table className="lesson-builder__preview-table">
                    <thead>
                      <tr>{(block.content.headers || []).map((h: string, i: number) => <th key={i} dangerouslySetInnerHTML={dhtml(h)} />)}</tr>
                    </thead>
                    <tbody>
                      {(block.content.rows || []).map((row: string[], ri: number) => (
                        <tr key={ri}>{row.map((cell, ci) => <td key={ci} dangerouslySetInnerHTML={dhtml(cell)} />)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {block.block_type === 'quiz' && (() => {
                const qKey = block.id;
                const selected = quizAnswers[qKey] ?? null;
                const revealed = quizRevealed[qKey] || false;
                return (
                  <div className="block-quiz" style={{ margin: '1.5rem 0' }}>
                    <div className="block-quiz__question">{block.content.question}</div>
                    <div className="block-quiz__options">
                      {(block.content.options || []).map((opt: string, i: number) => {
                        const isCorrect = i === block.content.correct;
                        const isSelected = selected === i;
                        let cls = 'block-quiz__option';
                        if (revealed && isCorrect) cls += ' block-quiz__option--correct';
                        else if (revealed && isSelected) cls += ' block-quiz__option--wrong';
                        else if (isSelected) cls += ' block-quiz__option--selected';
                        return (
                          <button key={i} className={cls} onClick={() => { if (!revealed) setQuizAnswers(prev => ({ ...prev, [qKey]: i })); }} disabled={revealed}>
                            <span className="block-quiz__option-letter">{String.fromCharCode(65 + i)}</span>
                            <span className="block-quiz__option-text">{opt}</span>
                            {revealed && isCorrect && <span className="block-quiz__option-icon"><Check size={14} strokeWidth={3} /></span>}
                            {revealed && isSelected && !isCorrect && <span className="block-quiz__option-icon"><X size={14} strokeWidth={3} /></span>}
                          </button>
                        );
                      })}
                    </div>
                    {selected !== null && !revealed && (
                      <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setQuizRevealed(prev => ({ ...prev, [qKey]: true }))} style={{ marginTop: '.75rem' }}>Check Answer</button>
                    )}
                    {revealed && (
                      <div className={`block-quiz__result ${selected === block.content.correct ? 'block-quiz__result--correct' : 'block-quiz__result--wrong'}`}>
                        <strong>{selected === block.content.correct ? 'Correct!' : 'Incorrect.'}</strong>
                        {block.content.explanation && <p style={{ margin: '.35rem 0 0' }}>{block.content.explanation}</p>}
                        <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => { setQuizAnswers(prev => ({ ...prev, [qKey]: null })); setQuizRevealed(prev => ({ ...prev, [qKey]: false })); }} style={{ marginTop: '.5rem' }}>Try Again</button>
                      </div>
                    )}
                  </div>
                );
              })()}
              {block.block_type === 'file' && block.content.url && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: '#F8F9FA', borderRadius: '8px', margin: '1.5rem 0', border: 'var(--border-light)' }}>
                  <span style={{ display: "inline-flex" }}><Paperclip size={20} strokeWidth={1.75} /></span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{block.content.name || 'File'}</div>
                    {block.content.size > 0 && <div style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>{formatFileSize(block.content.size)}</div>}
                  </div>
                  <a href={block.content.url} download={block.content.name} className="admin-btn admin-btn--ghost admin-btn--sm" style={{ marginLeft: 'auto' }}>Download</a>
                </div>
              )}
              {block.block_type === 'slideshow' && (block.content.images || []).length > 0 && (
                <div className="lesson-builder__slideshow-preview" style={{ margin: '1.5rem 0' }}>
                  {(() => {
                    const images = block.content.images || [];
                    const idx = slideshowIndexes[block.id] || 0;
                    const img = images[idx];
                    if (!img) return null;
                    return (
                      <div style={{ position: 'relative', textAlign: 'center' }}>
                        <Image src={img.url} alt={img.alt || ''} width={600} height={400} unoptimized style={{ maxWidth: '100%', maxHeight: '500px', height: 'auto', borderRadius: '8px', objectFit: 'contain' }} />
                        {img.caption && <p style={{ fontSize: '0.82rem', color: 'var(--color-text-tertiary)', marginTop: '0.5rem' }}>{img.caption}</p>}
                        {images.length > 1 && (
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '0.75rem' }}>
                            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => slideshowNav(block.id, 'prev', images.length)}>&larr;</button>
                            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-tertiary)' }}>{idx + 1} / {images.length}</span>
                            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => slideshowNav(block.id, 'next', images.length)}>&rarr;</button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
              {block.block_type === 'html' && (
                <div dangerouslySetInnerHTML={dhtml(block.content.code)} style={{ margin: '1.5rem 0' }} />
              )}
              {block.block_type === 'audio' && block.content.url && (
                <div style={{ margin: '1.5rem 0' }}>
                  {block.content.title && <p style={{ fontWeight: 600, marginBottom: '.5rem' }}>{block.content.title}</p>}
                  <audio controls src={block.content.url} style={{ width: '100%' }}>Your browser does not support audio.</audio>
                </div>
              )}
              {block.block_type === 'link_reference' && (block.content.links || []).length > 0 && (
                <div className="lesson-resources" style={{ margin: '1.5rem 0' }}>
                  <div className="lesson-resources__list">
                    {(block.content.links || []).map((link: any, i: number) => (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="lesson-resources__link">
                        {link.type === 'pdf' ? <FileText size={14} style={{ verticalAlign: "-2px" }} /> : link.type === 'website' ? <Globe size={14} style={{ verticalAlign: "-2px" }} /> : link.type === 'quiz' ? <HelpCircle size={14} style={{ verticalAlign: "-2px" }} /> : link.type === 'practice' ? <Target size={14} style={{ verticalAlign: "-2px" }} /> : <Paperclip size={14} style={{ verticalAlign: "-2px" }} />} {link.title || link.url}
                        {link.description && <span style={{ fontSize: '.78rem', color: 'var(--color-text-muted)', marginLeft: '.5rem' }}>{link.description}</span>}
                        <span className="lesson-resources__arrow">↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {block.block_type === 'flashcard' && (block.content.cards || []).length > 0 && (() => {
                const cards = block.content.cards || [];
                const isGrid = block.content.layout === 'grid';
                if (isGrid) {
                  return (
                    <div className="block-flashcard-grid" style={{ margin: '1.5rem 0' }}>
                      {cards.map((card: any, ci: number) => {
                        const flipKey = `${block.id}-${ci}`;
                        const isFlipped = flippedCards[flipKey] || false;
                        return (
                          <div key={ci} className="block-flashcard block-flashcard--grid-item">
                            <div className={`block-flashcard__card ${isFlipped ? 'block-flashcard__card--flipped' : ''}`} onClick={() => setFlippedCards(prev => ({ ...prev, [flipKey]: !isFlipped }))}>
                              <div className="block-flashcard__face block-flashcard__front">
                                <span className="block-flashcard__label">FRONT</span>
                                <p className="block-flashcard__text">{card?.front || ''}</p>
                                <span className="block-flashcard__hint">Click to flip</span>
                              </div>
                              <div className="block-flashcard__face block-flashcard__back">
                                <span className="block-flashcard__label">BACK</span>
                                <p className="block-flashcard__text">{card?.back || ''}</p>
                                <span className="block-flashcard__hint">Click to flip</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                const cardIdx = flashcardIndexes[block.id] || 0;
                const card = cards[cardIdx];
                const isFlipped = flippedCards[block.id] || false;
                return (
                  <div className="block-flashcard" style={{ margin: '1.5rem 0' }}>
                    <div className={`block-flashcard__card ${isFlipped ? 'block-flashcard__card--flipped' : ''}`} onClick={() => setFlippedCards(prev => ({ ...prev, [block.id]: !isFlipped }))}>
                      <div className="block-flashcard__face block-flashcard__front">
                        <span className="block-flashcard__label">FRONT</span>
                        <p className="block-flashcard__text">{card?.front || ''}</p>
                        <span className="block-flashcard__hint">Click to flip</span>
                      </div>
                      <div className="block-flashcard__face block-flashcard__back">
                        <span className="block-flashcard__label">BACK</span>
                        <p className="block-flashcard__text">{card?.back || ''}</p>
                        <span className="block-flashcard__hint">Click to flip</span>
                      </div>
                    </div>
                    {cards.length > 1 && (
                      <div className="block-flashcard__nav">
                        <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={(e) => { e.stopPropagation(); setFlippedCards(prev => ({ ...prev, [block.id]: false })); setFlashcardIndexes(prev => ({ ...prev, [block.id]: cardIdx <= 0 ? cards.length - 1 : cardIdx - 1 })); }}>&larr;</button>
                        <span style={{ fontSize: '.82rem', color: 'var(--color-text-tertiary)' }}>{cardIdx + 1} / {cards.length}</span>
                        <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={(e) => { e.stopPropagation(); setFlippedCards(prev => ({ ...prev, [block.id]: false })); setFlashcardIndexes(prev => ({ ...prev, [block.id]: cardIdx >= cards.length - 1 ? 0 : cardIdx + 1 })); }}>&rarr;</button>
                      </div>
                    )}
                  </div>
                );
              })()}
              {block.block_type === 'popup_article' && (
                <div className="block-popup-article" style={{ margin: '1.5rem 0' }}>
                  <div className="block-popup-article__header" onClick={() => setExpandedPopups(prev => ({ ...prev, [block.id]: !prev[block.id] }))}>
                    <div>
                      <h4 className="block-popup-article__title">{block.content.title || 'Article'}</h4>
                      <p className="block-popup-article__summary">{block.content.summary || ''}</p>
                    </div>
                    <span className={`block-popup-article__chevron ${expandedPopups[block.id] ? 'block-popup-article__chevron--open' : ''}`}><ChevronDown size={14} strokeWidth={2.5} /></span>
                  </div>
                  <div className={`block-popup-article__body ${expandedPopups[block.id] ? 'block-popup-article__body--open' : ''}`}>
                    <div className="block-popup-article__content" dangerouslySetInnerHTML={dhtml(block.content.full_content)} />
                  </div>
                </div>
              )}
              {block.block_type === 'backend_link' && (
                <div className="block-backend-link" style={{ margin: '1.5rem 0' }}>
                  <span className="block-backend-link__icon">{block.content.icon || '📖'}</span>
                  <div className="block-backend-link__info">
                    <span className="block-backend-link__title">{block.content.title || 'Page'}</span>
                    {block.content.description && <span className="block-backend-link__desc">{block.content.description}</span>}
                  </div>
                  <span className="block-backend-link__arrow">→</span>
                </div>
              )}
              {isHidden && !isCollapsed && (
                <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setCollapsedBlocks(prev => ({ ...prev, [block.id]: true }))} style={{ marginTop: '.5rem', fontSize: '.78rem' }}>Hide</button>
              )}
              </div></div>
            </div>
            );
            });
            return isRowGroup ? (
              <div key={`row-${rowIdx}`} className="block-row-group">{rowContent}</div>
            ) : (
              // Keyed. The shorthand `<>…</>` cannot take one, so every ungrouped row was an
              // unkeyed child of a list — React warned about it in the console and, more to the
              // point, could not tell one row from another when blocks are reordered by drag.
              // Caught by driving the preview rather than by reading the diff.
              <React.Fragment key={`row-${rowIdx}`}>{rowContent}</React.Fragment>
            );
          })}
          {blocks.length === 0 && (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem' }}>No content blocks yet. Switch to Edit mode to add blocks.</p>
          )}
        </div>
  );
}
