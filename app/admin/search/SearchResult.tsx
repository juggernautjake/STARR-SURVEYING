// app/admin/search/SearchResult.tsx — one row of the results list (§3b/8e, badges added by §8d).
//
// Split out of page.tsx because a Next.js page file may not carry arbitrary named exports — the
// generated route types constrain it to `default` plus the framework's own fields, so exporting the
// component for tests from there fails the build (TS2344 against `{ [x: string]: never }`). It has to
// live in its own module to be both rendered by the page and rendered by a test.
//
// And it must be renderable by a test: the page only draws results after a debounced fetch, which SSR
// never reaches, so the alternative is asserting these states from source text — which passes just as
// happily when the component renders nothing at all (§1.4).
'use client';

import React from 'react';
import Link from 'next/link';
import { FileText, Building2, Sparkles } from 'lucide-react';
import type { Hit } from './types';

export function Result({ hit }: { hit: Hit }) {
  const Icon = hit.kind === 'record' ? Building2 : FileText;
  const date = hit.effectiveAt ?? hit.createdAt;

  const body = (
    <div style={{ display: 'flex', gap: '0.6rem', padding: '0.6rem 0.7rem' }}>
      <Icon size={16} style={{ flexShrink: 0, marginTop: '0.15rem', color: 'var(--color-text-muted)' }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }}>
            {hit.title}
          </span>
          {/* Says HOW this result was found. A document nothing in the query mentions is a surprising
              result, and a surprising result with no explanation reads as a bug in the search. */}
          {(hit.semanticOnly || hit.alsoFound) && (
            <span
              data-testid={hit.semanticOnly ? 'hit-semantic-only' : 'hit-also-found'}
              title={hit.semanticOnly
                ? 'Found by meaning — none of your words appear in it.'
                : 'Matched your words, and independently matched by meaning.'}
              style={{
                display: 'inline-flex', gap: '0.2rem', alignItems: 'center',
                padding: '0.05rem 0.35rem', borderRadius: 'var(--radius-pill)',
                border: 'var(--border-light)', color: 'var(--color-text-muted)',
                fontSize: 'var(--text-2xs, 0.65rem)', whiteSpace: 'nowrap',
              }}
            >
              <Sparkles size={10} />
              {hit.semanticOnly ? 'found by meaning' : 'also by meaning'}
            </span>
          )}
        </div>
        {hit.snippet && (
          <div style={{
            color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', marginTop: '0.15rem',
            overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {hit.snippet}
          </div>
        )}
        <div style={{ marginTop: '0.2rem', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
          {hit.type ? `${hit.type} · ` : ''}{date ? new Date(date).toLocaleDateString() : 'no date'}
        </div>
      </div>
    </div>
  );

  const shell: React.CSSProperties = {
    display: 'block', border: 'var(--border-light)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg-card)', marginBottom: '0.4rem', textDecoration: 'none',
  };

  // No viewer page for this corpus (`customers` today). Rendering a link would ship a 404 dressed as
  // a feature — the snippet above already carries the contact details, which is the answer.
  if (!hit.href) {
    return <div data-testid="search-hit" data-linkless="true" style={shell}>{body}</div>;
  }
  return <Link data-testid="search-hit" href={hit.href} style={shell}>{body}</Link>;
}
