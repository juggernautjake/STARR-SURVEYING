'use client';

// app/admin/map/components/MapFrame.tsx — the map, and what to show when there is no map.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// Google Maps does not fail quietly. When it refuses a key — a referrer not on the allow-list, a
// billing lapse, a blocked script — it THROWS, from inside its own constructor, during the effect
// that creates the map. React sees an uncaught error in the tree and unmounts the whole page.
//
// Observed on 2026-09-19 while trying to verify the file panel: every request succeeded, the job
// loaded, and the page rendered NOTHING. Not a broken map on a working page — an empty document,
// because one refused API key had taken the files, the layers, the point panel and the toolbar
// down with it.
//
// That is a bad trade in any circumstance. Most of this page is not the map: the files panel, the
// layers, a point's attachments and every rename are ordinary DOM over ordinary JSON, and none of
// them stop working because Google is unhappy. So the map sits inside a boundary of its own, and
// when it falls over it falls over alone.
//
// The message names the actual cause rather than apologising, because the two likely causes — a
// referrer that is not allow-listed, and a key that has stopped being paid for — are both fixed in
// the Cloud Console by whoever is reading it.
import React from 'react';
import { MapPinOff } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Told when the map dies, so the page can stop waiting for a camera that will never move. */
  onFailed?: () => void;
}

interface State {
  failed: boolean;
  message: string | null;
}

export default class MapFrame extends React.Component<Props, State> {
  state: State = { failed: false, message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown) {
    // Logged rather than reported: this is nearly always a configuration problem on the Google
    // side, and a page-error banner for it would say less than the panel below already does.
    console.error('[property map] Google Maps failed to start:', error);
    this.props.onFailed?.();
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="gmap__dead" role="status" data-testid="gmap-dead">
        <MapPinOff size={26} aria-hidden />
        <strong>The map could not start.</strong>
        <p>
          Google refused the request. That is usually one of two things: this site&apos;s address is
          not on the API key&apos;s list of allowed referrers, or billing has lapsed on the Maps
          Platform project. Both are fixed in the Google Cloud Console.
        </p>
        <p className="gmap__dead-rest">
          Everything else on this page still works — the files, the layers, and every point&apos;s
          details are all here.
        </p>
        {this.state.message && <code className="gmap__dead-detail">{this.state.message}</code>}
      </div>
    );
  }
}
