import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/page-metadata';

// This layout exists ONLY to carry metadata.
//
// `app/resources/page.tsx` is a `'use client'` component, and a client component cannot export
// `metadata` — Next ignores it and serves the root layout's default title instead. Measured live
// on 2026-08-25, this page was shipping the HOMEPAGE'S title tag and no description of its own.
//
// A layout is a server component, so it can export what the page cannot. The titles and the
// self-referencing canonical are in lib/seo/page-metadata.ts, which explains both.

export const metadata: Metadata = pageMetadata({
  title: 'Land Surveying Resources & Answers',
  description:
    'Plain-English answers about property surveys in Texas — what each survey type is for, what to expect on site, and the documents and terms you will encounter.',
  path: '/resources',
});

export default function Layout({ children }: { children: React.ReactNode }): React.ReactElement {
  return <>{children}</>;
}
