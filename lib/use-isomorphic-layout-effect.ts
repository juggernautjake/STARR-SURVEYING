// lib/use-isomorphic-layout-effect.ts
// useLayoutEffect that no-ops to useEffect on the server, so client components
// that need to position scroll BEFORE paint (e.g. a chat opening at the bottom
// of the history) don't log the "useLayoutEffect does nothing on the server"
// warning during SSR.
import { useEffect, useLayoutEffect } from 'react';

export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;
