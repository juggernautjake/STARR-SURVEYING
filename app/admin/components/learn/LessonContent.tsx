'use client';

// app/admin/components/learn/LessonContent.tsx — one body of lesson prose, demos and all.
//
// Both views of a module — the full page and the step-by-step slideshow — render their content
// through this, so an embedded demo works identically in each. That is the whole reason it is a
// component and not two copies of the same `dangerouslySetInnerHTML` call: the moment the two
// diverge, a demo appears in one view and silently vanishes in the other, and nobody notices until
// somebody studying in slides asks where the compass went.
//
// See lib/learn/demos.ts for why the directive exists and how it is parsed.

import { splitDemos, numberProp, type DemoDirective } from '@/lib/learn/demos';
import QuadrantPicker from './QuadrantPicker';

export interface LessonContentProps {
  /** The raw markdown of the section or chunk. */
  content: string;
  /** Markdown to HTML. Passed in so this component has no opinion about the renderer. */
  render: (markdown: string) => string;
  /** The term-popup handler the page already uses on its content. */
  onContentClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Extra classes for the prose blocks, so callers keep their own layout. */
  className?: string;
  /** Applied to the wrapper, e.g. a staged-reveal delay. */
  style?: React.CSSProperties;
}

/** Turn a directive into the component it names. */
function Demo({ demo }: { demo: DemoDirective }) {
  switch (demo.name) {
    case 'quadrant':
      // 192° is the owner's own example, and it is a good default: it is in the south-west, which
      // is the quadrant a bare TAN⁻¹ is least likely to hand you.
      return <QuadrantPicker azimuth={numberProp(demo.props, 'azimuth', 192)} />;
    default:
      return null;
  }
}

export default function LessonContent({ content, render, onContentClick, className, style }: LessonContentProps) {
  const segments = splitDemos(content);

  // The common case — no demo — renders exactly the single div it always did, with no wrapper
  // around it, so no existing layout or selector shifts underneath it.
  if (segments.length === 1 && segments[0].kind === 'html') {
    return (
      <div
        className={className}
        style={style}
        onClick={onContentClick}
        dangerouslySetInnerHTML={{ __html: render(content) }}
      />
    );
  }

  return (
    <div className="fs-lesson" style={style}>
      {segments.map((seg, i) =>
        seg.kind === 'html' ? (
          <div
            key={`html-${i}`}
            className={className}
            onClick={onContentClick}
            dangerouslySetInnerHTML={{ __html: render(seg.text) }}
          />
        ) : (
          <div key={`demo-${i}`} className="fs-lesson__demo">
            <Demo demo={seg.demo} />
          </div>
        ),
      )}
    </div>
  );
}
