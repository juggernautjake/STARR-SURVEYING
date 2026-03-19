'use client';

import { useState } from 'react';
import QRCode from 'react-qr-code';

// ── Google Place ID for Starr Surveying ─────────────────────────────────────
// Found via Google Maps Place ID Finder:
// https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder
const PLACE_ID = 'ChIJV77ibdAVRYYRYCVt8suXPQE';
const REVIEW_URL = `https://search.google.com/local/writereview?placeid=${PLACE_ID}`;

export default function GoogleReviewWidget(): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(REVIEW_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for non-HTTPS or older browsers
      const textarea = document.createElement('textarea');
      textarea.value = REVIEW_URL;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="review-widget">
      <h3 className="footer__heading">Leave a Review</h3>

      <div className="review-widget__buttons">
        {/* Write a Review — opens Google's review page */}
        <a
          href={REVIEW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="review-widget__btn review-widget__btn--primary"
        >
          <svg className="review-widget__icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
          Write a Review
        </a>

        {/* Copy review link to clipboard */}
        <button
          onClick={handleCopyLink}
          className={`review-widget__btn review-widget__btn--secondary ${copied ? 'review-widget__btn--copied' : ''}`}
          type="button"
        >
          {copied ? (
            <>
              <svg className="review-widget__icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
              Link Copied!
            </>
          ) : (
            <>
              <svg className="review-widget__icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
              </svg>
              Copy Review Link
            </>
          )}
        </button>

        {/* Toggle QR code */}
        <button
          onClick={() => setShowQR((prev) => !prev)}
          className="review-widget__btn review-widget__btn--secondary"
          type="button"
        >
          <svg className="review-widget__icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13-2h-2v3h-3v2h3v3h2v-3h3v-2h-3v-3z" />
          </svg>
          {showQR ? 'Hide QR Code' : 'Show QR Code'}
        </button>
      </div>

      {/* QR Code panel */}
      {showQR && (
        <div className="review-widget__qr">
          <div className="review-widget__qr-box">
            <QRCode
              value={REVIEW_URL}
              size={160}
              bgColor="#FFFFFF"
              fgColor="#1D3095"
              level="M"
            />
          </div>
          <p className="review-widget__qr-label">
            Scan to leave a review on Google
          </p>
        </div>
      )}
    </div>
  );
}
