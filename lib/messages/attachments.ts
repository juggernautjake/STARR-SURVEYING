// lib/messages/attachments.ts
// Shared constant for the message-attachments storage bucket. Lives outside the
// route handlers because Next.js App Router `route.ts` files may only export the
// HTTP method handlers + a fixed set of segment-config fields — exporting an
// arbitrary constant from a route file fails `next build` ("not a valid Route
// export field"). Both the upload route and the messages GET (which signs the
// stored paths) import this.

export const MESSAGE_ATTACHMENTS_BUCKET = 'message-attachments';
