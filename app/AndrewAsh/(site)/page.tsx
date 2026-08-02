// app/AndrewAsh/page.tsx — the home page.
//
// There is no layout here, and that is the point. The page is `lib/voice/default-pages.ts` → HOME,
// rendered through the same widget renderer that renders everything else, so Andrew can rearrange,
// restyle or replace any part of his own front page without a developer.
//
// `revalidate = 0` rather than a cache window: `SystemPage` reads the session cookie to decide
// whether to render the owner chrome, and a cached response would serve Andrew's edit buttons to a
// visitor (or hide them from Andrew). Correctness beats a cache on a site this size.

import type { Metadata } from 'next';
import SystemPage, { systemPageMetadata } from '../_ui/SystemPage';

export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const meta = await systemPageMetadata('home');
  // `absolute` breaks out of the ROOT layout's `%s | Starr Surveying` template. Without it, Andrew's
  // home page is titled with a surveying company's name — which is wrong on the tab and much worse
  // in a Google result for his name.
  return { title: { absolute: meta.title }, description: meta.description };
}

export default async function VoiceHomePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}): Promise<React.ReactElement> {
  return <SystemPage slug="home" searchParams={searchParams} />;
}
