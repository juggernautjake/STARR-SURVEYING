import Script from 'next/script';
import { GA_ADS_ID } from '../utils/gtag';

/**
 * Loads the Google Ads global site tag.
 * Include this component only on pages that fire conversion events
 * (i.e. pages that call trackConversion()).
 */
export default function GoogleAdsScript(): React.ReactElement {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-gtag" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ADS_ID}');
        `}
      </Script>
    </>
  );
}
