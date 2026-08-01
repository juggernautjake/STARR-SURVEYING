// __tests__/fixtures/firm.ts — a sending firm, for the money-email builders (audit item 8h).
//
// The builders take `firm` as a REQUIRED input now, so tests have to name one. That is the point: a
// test that renders an invoice email with no firm in sight would pass while the real one went out
// nameless.
//
// Two fixtures, because the interesting assertions are about the difference between them:
//   · `TEST_FIRM`       — a fully configured firm.
//   · `TEST_FIRM_OTHER` — a DIFFERENT firm, for asserting that nothing leaks between them. Any test
//                         that renders with this and finds "Starr" in the output has found a
//                         hard-code the type system could not catch.

import type { FirmIdentity } from '@/lib/payments/invoice-email';

export const TEST_FIRM: FirmIdentity = {
  name: 'Starr Surveying',
  phone: '(936) 662-0077',
  phoneE164: '+19366620077',
};

export const TEST_FIRM_OTHER: FirmIdentity = {
  name: 'Brazos Land Surveying',
  phone: '(512) 555-0143',
  phoneE164: '+15125550143',
};

/** A firm that has not filled in its details. Renders blank rather than borrowing somebody's — see
 *  `EMPTY_PROFILE`. Templates must stay sendable in this state. */
export const TEST_FIRM_BLANK: FirmIdentity = {
  name: '',
  phone: null,
  phoneE164: null,
};
