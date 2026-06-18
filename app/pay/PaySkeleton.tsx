// app/pay/PaySkeleton.tsx
//
// P20 of payment-infrastructure-2026-06-18.md — skeleton placeholder
// shown while /pay/[invoice] fetches. Replaces the plain "Loading…"
// to keep the page feeling responsive. Pure presentational +
// reduced-motion friendly (the shimmer animation is suspended via
// @media prefers-reduced-motion in Pay.css).

export default function PaySkeleton(): React.ReactElement {
  return (
    <div
      className="pay-skeleton"
      data-testid="pay-skeleton"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="visually-hidden">Loading your invoice…</span>
      <div className="pay-skeleton__hero">
        <div className="pay-skeleton__eyebrow" />
        <div className="pay-skeleton__title" />
        <div className="pay-skeleton__pill" />
      </div>
      <div className="pay-skeleton__card">
        <div className="pay-skeleton__line pay-skeleton__line--lg" />
        <div className="pay-skeleton__line" />
        <div className="pay-skeleton__line" />
        <div className="pay-skeleton__line pay-skeleton__line--lg" />
        <div className="pay-skeleton__line" />
      </div>
    </div>
  );
}
