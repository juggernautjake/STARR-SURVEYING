// app/AndrewAsh/work/page.tsx — the Work page.
//
// Content lives in `lib/voice/default-pages.ts`, or in `va_pages` once Andrew has edited it.
// This file exists only to name the slug and the metadata; every page on the site is data.

import type { Metadata } from 'next';
import SystemPage, { systemPageMetadata } from '../../_ui/SystemPage';

export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const meta = await systemPageMetadata('work');
  return { title: meta.title, description: meta.description };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}): Promise<React.ReactElement> {
  return <SystemPage slug="work" searchParams={searchParams} />;
}
