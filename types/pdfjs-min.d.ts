// pdfjs-dist ships types for build/pdf.mjs only. The viewer imports the MINIFIED build
// (app/admin/components/files/FileViewer.tsx says why); it is the same module, so it gets the same types.
declare module 'pdfjs-dist/build/pdf.min.mjs' {
  export * from 'pdfjs-dist';
}
