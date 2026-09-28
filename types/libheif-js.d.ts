// Minimal typings for the two libheif-js entry points this app loads. The package ships a
// `libheif.d.ts` for its classic build only; the bundles are typed here against the narrow surface
// `lib/images/heic-decode-core.ts` actually uses.

declare module 'libheif-js/wasm-bundle' {
  import type { LibheifLike } from '@/lib/images/heic-decode-core';
  const libheif: LibheifLike;
  export = libheif;
}

declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  import type { LibheifLike } from '@/lib/images/heic-decode-core';
  const factory: () => LibheifLike;
  export default factory;
}
